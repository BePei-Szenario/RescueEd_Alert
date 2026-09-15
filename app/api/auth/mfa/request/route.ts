import {and,eq,gt,isNull,sql} from "drizzle-orm";
import {getDb} from "@/db";
import {emailOutbox,securityTokens,users} from "@/db/schema";
import {emailPayload} from "@/lib/email-signature";
import {senderFor} from "@/lib/email-settings";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {id,tokenHash} from "@/lib/security";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {challenge}=await request.json() as {challenge?:string};if(!challenge||challenge.length>200)return Response.json({error:"Anmeldevorgang ungültig oder abgelaufen."},{status:401});
  const networkLimit=await consumeRateLimit({scope:"mfa-resend-network",subject:requestNetwork(request),limit:20,windowMs:60*60_000});
  if(!networkLimit.allowed)return rateLimited(networkLimit.retryAfterSeconds);
  const challengeHash=await tokenHash(challenge),challengeLimit=await consumeRateLimit({scope:"mfa-resend-challenge",subject:challengeHash,limit:3,windowMs:10*60_000});
  if(!challengeLimit.allowed)return rateLimited(challengeLimit.retryAfterSeconds);
  const db=getDb(),now=new Date(),[token]=await db.select().from(securityTokens).where(and(eq(securityTokens.challengeHash,challengeHash),eq(securityTokens.purpose,"mfa"),isNull(securityTokens.usedAt),gt(securityTokens.expiresAt,now))).limit(1);
  if(!token)return Response.json({error:"Anmeldevorgang ungültig oder abgelaufen."},{status:401});
  const [user]=await db.select({id:users.id,email:users.email,status:users.status}).from(users).where(eq(users.id,token.userId)).limit(1);
  if(!user||user.status!=="active")return Response.json({error:"Anmeldevorgang ungültig oder abgelaufen."},{status:401});
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1_000_000).padStart(6,"0"),expiresAt=new Date(now.getTime()+10*60_000),senderEmail=await senderFor("mfa"),mailId=id("mail");
  const payload=await sensitiveEmailPayload(request,mailId,"mfa",emailPayload({template:"security_code",securityCode:code,expiresAt:expiresAt.toISOString(),message:"Mit diesem Sicherheitscode schließen Sie Ihre Anmeldung bei RescueEd Alert ab."}));
  const rotated=await db.update(securityTokens)
   .set({tokenHash:await tokenHash(code),attempts:0,sends:sql`${securityTokens.sends} + 1`,expiresAt})
   .where(and(eq(securityTokens.id,token.id),eq(securityTokens.sends,token.sends),isNull(securityTokens.usedAt)))
   .returning({id:securityTokens.id});
  if(rotated.length!==1)return Response.json({error:"Anmeldevorgang ungültig oder bereits aktualisiert."},{status:409});
  await db.insert(emailOutbox).values({id:mailId,userId:user.id,type:"mfa",senderEmail,recipientEmail:user.email,subject:"Ihr RescueEd Alert Sicherheitscode",payloadJson:payload,sensitiveExpiresAt:expiresAt,createdAt:now});
  return Response.json({ok:true,previewCode:process.env.NODE_ENV==="production"?undefined:code},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("mfa_request_failed",error);return Response.json({error:"Sicherheitscode konnte nicht erstellt werden."},{status:500})}
}
