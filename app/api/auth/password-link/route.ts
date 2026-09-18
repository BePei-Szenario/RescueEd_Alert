import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {emailOutbox,securityTokens,users} from "@/db/schema";
import {emailPayload} from "@/lib/email-signature";
import {senderFor} from "@/lib/email-settings";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {id,tokenHash} from "@/lib/security";

export async function POST(request:Request){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 try{
  const body=await request.json() as {email?:unknown};
  const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
  if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Bitte eine gültige E-Mail-Adresse eingeben."},{status:400});
  const networkLimit=await consumeRateLimit({scope:"password-link-network",subject:requestNetwork(request),limit:10,windowMs:60*60_000});
  if(!networkLimit.allowed)return rateLimited(networkLimit.retryAfterSeconds);
  const emailLimit=await consumeRateLimit({scope:"password-link-email",subject:email,limit:3,windowMs:60*60_000});
  if(!emailLimit.allowed)return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
  const db=getDb(),[user]=await db.select({id:users.id,status:users.status}).from(users).where(eq(users.email,email)).limit(1);
  if(user?.status==="active"){
   const raw=crypto.randomUUID()+crypto.randomUUID(),now=new Date(),expiresAt=new Date(now.getTime()+30*60_000),mailId=id("mail"),senderEmail=await senderFor("password_reset");
   const payload=await sensitiveEmailPayload(request,mailId,"password_reset",emailPayload({template:"password_link",token:raw,expiresAt:expiresAt.toISOString(),message:"Über diesen einmaligen Link legen Sie ein neues Passwort fest. Wenn Sie dies nicht angefordert haben, ignorieren Sie diese Nachricht."}));
   await db.batch([
    db.insert(securityTokens).values({id:id("sec"),userId:user.id,purpose:"password_reset",tokenHash:await tokenHash(raw),expiresAt,createdAt:now}),
    db.insert(emailOutbox).values({id:mailId,userId:user.id,type:"password_reset",senderEmail,recipientEmail:email,subject:"RescueEd Alert – Passwort zurücksetzen",payloadJson:payload,sensitiveExpiresAt:expiresAt,createdAt:now})
   ]);
  }
  return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("password_link_request_failed",error);return Response.json({error:"Anfrage konnte nicht verarbeitet werden."},{status:500})}
}
