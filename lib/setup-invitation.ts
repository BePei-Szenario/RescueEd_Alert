import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,emailOutbox,securityTokens} from "@/db/schema";
import {emailPayload} from "@/lib/email-signature";
import {senderFor} from "@/lib/email-settings";
import {sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {id,tokenHash} from "@/lib/security";

export async function resendSetupInvitation(request:Request,options:{actorId:string;targetId:string;email:string;subject:string;message:string;action:string}){
 const db=getDb(),raw=crypto.randomUUID()+crypto.randomUUID(),now=new Date(),expiresAt=new Date(now.getTime()+30*60_000),mailId=id("mail"),senderEmail=await senderFor("password_reset");
 const payload=await sensitiveEmailPayload(request,mailId,"password_reset",emailPayload({template:"password_link",token:raw,expiresAt:expiresAt.toISOString(),message:options.message}));
 await db.batch([
  db.delete(securityTokens).where(eq(securityTokens.userId,options.targetId)),
  db.insert(securityTokens).values({id:id("sec"),userId:options.targetId,purpose:"password_setup",tokenHash:await tokenHash(raw),expiresAt,createdAt:now}),
  db.insert(emailOutbox).values({id:mailId,userId:options.targetId,type:"password_reset",senderEmail,recipientEmail:options.email,subject:options.subject,payloadJson:payload,sensitiveExpiresAt:expiresAt,createdAt:now}),
  db.insert(auditLogs).values({id:id("aud"),actorUserId:options.actorId,action:options.action,entityType:"user",entityId:options.targetId,createdAt:now})
 ]);
 return Response.json({ok:true,previewUrl:process.env.NODE_ENV==="production"?undefined:`/password-reset?token=${encodeURIComponent(raw)}`},{headers:{"cache-control":"no-store"}});
}
