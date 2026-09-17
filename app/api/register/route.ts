import {and,eq,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {emailOutbox,pendingRegistrations,users} from "@/db/schema";
import {senderFor} from "@/lib/email-settings";
import {emailPayload} from "@/lib/email-signature";
import {currentRegistrationDocuments,evidenceFor,matchesEvidence} from "@/lib/legal-registration";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {id,tokenHash} from "@/lib/security";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const body=await request.json() as {organization?:string;contactName?:string;street?:string;houseNumber?:string;postalCode?:string;city?:string;email?:string;acceptedDocumentVersionIds?:string[]};
  const organization=body.organization?.trim(),contactName=body.contactName?.trim(),street=body.street?.trim(),houseNumber=body.houseNumber?.trim(),postalCode=body.postalCode?.trim(),city=body.city?.trim(),email=body.email?.trim().toLowerCase();
  if(!organization||!contactName||!street||!houseNumber||!postalCode||!city||!email)return Response.json({error:"Bitte alle Angaben ausfüllen."},{status:400});
  if(organization.length>160||contactName.length>160||street.length>160||houseNumber.length>30||city.length>120||email.length>254)return Response.json({error:"Eine Eingabe ist zu lang."},{status:400});
  if(!/^\S+@\S+\.\S+$/.test(email)||!/^[0-9A-Za-zÄÖÜäöüß -]{3,10}$/.test(postalCode))return Response.json({error:"Bitte E-Mail-Adresse und Postleitzahl prüfen."},{status:400});
  const networkLimit=await consumeRateLimit({scope:"register-network",subject:requestNetwork(request),limit:10,windowMs:60*60_000});if(!networkLimit.allowed)return rateLimited(networkLimit.retryAfterSeconds);
  const emailLimit=await consumeRateLimit({scope:"register-email-network",subject:JSON.stringify([email,requestNetwork(request)]),limit:3,windowMs:24*60*60_000});if(!emailLimit.allowed)return rateLimited(emailLimit.retryAfterSeconds);
  const legalDocuments=await currentRegistrationDocuments();
  if(!legalDocuments)return Response.json({error:"Die Registrierung ist derzeit nicht möglich: Rechtstexte sind nicht vollständig veröffentlicht."},{status:503});
  const legalEvidence=evidenceFor(legalDocuments);
  if(!matchesEvidence(legalEvidence,body.acceptedDocumentVersionIds))return Response.json({error:"Bitte alle aktuellen Rechtstexte einzeln lesen und bestätigen."},{status:400});
  const acceptedAt=Date.now(),accepted=async()=>{const wait=350-(Date.now()-acceptedAt);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));return Response.json({ok:true,expiresAt:expiresAt.toISOString()},{status:202,headers:{"cache-control":"no-store"}})};
  const db=getDb(),[existing]=await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1);
  const now=new Date(),expiresAt=new Date(now.getTime()+24*60*60*1000);
  if(existing)return accepted();
  const raw=crypto.randomUUID()+crypto.randomUUID(),registrationId=id("reg"),senderEmail=await senderFor("registration_link"),mailId=id("mail");
  const payload=await sensitiveEmailPayload(request,mailId,"registration_link",emailPayload({template:"registration_link",token:raw,expiresAt:expiresAt.toISOString(),message:"Über diesen einmaligen Link legen Sie Ihr Passwort fest und schließen die Registrierung ab."}));
  await db.batch([
   db.delete(pendingRegistrations).where(and(eq(pendingRegistrations.email,email),isNull(pendingRegistrations.usedAt))),
   db.insert(pendingRegistrations).values({id:registrationId,organizationName:organization,contactName,street,houseNumber,postalCode,city,email,tokenHash:await tokenHash(raw),termsVersion:legalEvidence.find(x=>x.documentKey==="agb")!.documentVersion,privacyVersion:legalEvidence.find(x=>x.documentKey==="datenschutz")!.documentVersion,avvVersion:legalEvidence.find(x=>x.documentKey==="avv")!.documentVersion,legalEvidenceJson:JSON.stringify(legalEvidence),acceptedAt:now,expiresAt,createdAt:now}),
   db.insert(emailOutbox).values({id:mailId,type:"registration_link",senderEmail,recipientEmail:email,subject:"RescueEd Alert – Registrierung abschließen",payloadJson:payload,sensitiveExpiresAt:expiresAt,createdAt:now})
  ]);
  const wait=350-(Date.now()-acceptedAt);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
  return Response.json({ok:true,expiresAt:expiresAt.toISOString(),previewUrl:process.env.NODE_ENV==="production"?undefined:`/password-reset?mode=registration&token=${encodeURIComponent(raw)}`},{status:202,headers:{"cache-control":"no-store"}});
 }catch(error){console.error("registration_failed",error);return Response.json({error:"Registrierung konnte nicht vorbereitet werden."},{status:500})}
}
