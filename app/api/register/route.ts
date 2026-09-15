import {and,eq,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {emailOutbox,pendingRegistrations,users} from "@/db/schema";
import {senderFor} from "@/lib/email-settings";
import {emailPayload} from "@/lib/email-signature";
import {LEGAL_VERSIONS} from "@/lib/legal-documents";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const body=await request.json() as {organization?:string;contactName?:string;street?:string;houseNumber?:string;postalCode?:string;city?:string;email?:string;termsAccepted?:boolean;privacyAccepted?:boolean;avvAccepted?:boolean};
  const organization=body.organization?.trim(),contactName=body.contactName?.trim(),street=body.street?.trim(),houseNumber=body.houseNumber?.trim(),postalCode=body.postalCode?.trim(),city=body.city?.trim(),email=body.email?.trim().toLowerCase();
  if(!organization||!contactName||!street||!houseNumber||!postalCode||!city||!email||!body.termsAccepted||!body.privacyAccepted||!body.avvAccepted)return Response.json({error:"Bitte alle Angaben ausfüllen und AGB, Datenschutz sowie AVV bestätigen."},{status:400});
  if(!/^\S+@\S+\.\S+$/.test(email)||!/^[0-9A-Za-zÄÖÜäöüß -]{3,10}$/.test(postalCode))return Response.json({error:"Bitte E-Mail-Adresse und Postleitzahl prüfen."},{status:400});
  const db=getDb(),[existing]=await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1);
  if(existing)return Response.json({error:"Für diese E-Mail-Adresse besteht bereits ein Konto."},{status:409});
  const raw=crypto.randomUUID()+crypto.randomUUID(),now=new Date(),expiresAt=new Date(now.getTime()+24*60*60*1000),registrationId=id("reg"),senderEmail=await senderFor("registration_link");
  await db.batch([
   db.delete(pendingRegistrations).where(and(eq(pendingRegistrations.email,email),isNull(pendingRegistrations.usedAt))),
   db.insert(pendingRegistrations).values({id:registrationId,organizationName:organization,contactName,street,houseNumber,postalCode,city,email,tokenHash:await tokenHash(raw),termsVersion:LEGAL_VERSIONS.terms,privacyVersion:LEGAL_VERSIONS.privacy,avvVersion:LEGAL_VERSIONS.avv,acceptedAt:now,expiresAt,createdAt:now}),
   db.insert(emailOutbox).values({id:id("mail"),type:"registration_link",senderEmail,recipientEmail:email,subject:"RescueEd Alert – Registrierung abschließen",payloadJson:emailPayload({template:"registration_link",token:raw,expiresAt:expiresAt.toISOString(),message:"Über diesen einmaligen Link legen Sie Ihr Passwort fest und schließen die Registrierung ab."}),createdAt:now})
  ]);
  return Response.json({ok:true,expiresAt:expiresAt.toISOString(),previewUrl:process.env.NODE_ENV==="production"?undefined:`/password-reset?mode=registration&token=${encodeURIComponent(raw)}`},{status:202});
 }catch(error){console.error("registration_failed",error);return Response.json({error:"Registrierung konnte nicht vorbereitet werden."},{status:500})}
}
