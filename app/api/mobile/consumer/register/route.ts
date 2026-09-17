import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {emailOutbox,pendingConsumerRegistrations,users} from "@/db/schema";
import {currentConsumerDocuments,consumerEvidence,matchesConsumerEvidence} from "@/lib/consumer-legal";
import {emailPayload} from "@/lib/email-signature";
import {senderFor} from "@/lib/email-settings";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {hashSecret,id,tokenHash} from "@/lib/security";
import {sensitiveEmailPayload} from "@/lib/secure-email-payload";

export async function GET(){
 try{
  const documents=await currentConsumerDocuments();
  if(!documents)return Response.json({error:"Die B2C-Registrierung ist erst nach Veröffentlichung der AGB, Datenschutzerklärung und Widerrufsbelehrung möglich."},{status:503,headers:{"cache-control":"no-store"}});
  return Response.json({documents:documents.map(({id,documentKey,title,version,content})=>({id,documentKey,title,version,content}))},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("consumer_registration_legal_failed",error);return Response.json({error:"Rechtstexte konnten nicht geladen werden."},{status:503})}
}

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const body=await request.json() as {fullName?:string;email?:string;password?:string;acknowledgedVersionIds?:string[]};
  const fullName=body.fullName?.trim()||"",email=body.email?.trim().toLowerCase()||"",password=body.password||"";
  if(fullName.length<2||fullName.length>160||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>1024)return Response.json({error:"Bitte Name, E-Mail-Adresse und ein Passwort mit mindestens 12 Zeichen prüfen."},{status:400});
  const limit=await consumeRateLimit({scope:"consumer-register-network",subject:requestNetwork(request),limit:8,windowMs:60*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const accountLimit=await consumeRateLimit({scope:"consumer-register-account",subject:email,limit:3,windowMs:24*60*60_000});if(!accountLimit.allowed)return rateLimited(accountLimit.retryAfterSeconds);
  const documents=await currentConsumerDocuments();if(!documents)return Response.json({error:"Die B2C-Rechtstexte sind noch nicht veröffentlicht."},{status:503});
  const evidence=consumerEvidence(documents);if(!matchesConsumerEvidence(evidence,body.acknowledgedVersionIds))return Response.json({error:"Bitte AGB akzeptieren und Datenschutzerklärung sowie Widerrufsbelehrung bestätigen."},{status:400});
  const db=getDb(),[existing]=await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1);
  const now=new Date(),expiresAt=new Date(now.getTime()+10*60_000);
  if(existing)return Response.json({ok:true,message:"Falls noch kein Konto besteht, wurde ein Sicherheitscode versandt."},{status:202,headers:{"cache-control":"no-store"}});
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1_000_000).padStart(6,"0"),mailId=id("mail"),senderEmail=await senderFor("mfa");
  const payload=await sensitiveEmailPayload(request,mailId,"mfa",emailPayload({template:"security_code",securityCode:code,expiresAt:expiresAt.toISOString(),message:"Mit diesem Sicherheitscode schließen Sie die Registrierung in der RescueEd Alert App ab."}));
  await db.batch([
   db.insert(pendingConsumerRegistrations).values({id:id("pcr"),fullName,email,passwordHash:await hashSecret(password),codeHash:await tokenHash(code),legalEvidenceJson:JSON.stringify(evidence),acceptedAt:now,expiresAt,createdAt:now}).onConflictDoUpdate({target:pendingConsumerRegistrations.email,set:{fullName,passwordHash:await hashSecret(password),codeHash:await tokenHash(code),legalEvidenceJson:JSON.stringify(evidence),attempts:0,acceptedAt:now,expiresAt,createdAt:now}}),
   db.insert(emailOutbox).values({id:mailId,type:"mfa",senderEmail,recipientEmail:email,subject:"RescueEd Alert – Registrierung bestätigen",payloadJson:payload,sensitiveExpiresAt:expiresAt,createdAt:now})
  ]);
  return Response.json({ok:true,message:"Sicherheitscode versandt.",previewCode:process.env.NODE_ENV==="production"?undefined:code},{status:202,headers:{"cache-control":"no-store"}});
 }catch(error){console.error("consumer_registration_failed",error);return Response.json({error:"Registrierung konnte nicht vorbereitet werden."},{status:500})}
}
