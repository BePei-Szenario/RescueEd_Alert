import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,emailOutbox,securityTokens,users} from "@/db/schema";
import {emailPayload} from "@/lib/email-signature";
import {senderFor} from "@/lib/email-settings";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {hashSecret,id,tokenHash} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";

export async function POST(request:Request){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
 try{
  const body=await request.json() as {name?:unknown;email?:unknown};
  const name=typeof body.name==="string"?body.name.trim():"",email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
  if(!name||name.length>160||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Bitte Name und gültige E-Mail-Adresse angeben."},{status:400});
  const db=getDb(),[existing]=await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1);
  if(existing)return Response.json({error:"Diese E-Mail-Adresse wird bereits verwendet."},{status:409});
  const userId=id("usr"),mailId=id("mail"),raw=crypto.randomUUID()+crypto.randomUUID(),now=new Date(),expiresAt=new Date(now.getTime()+30*60_000),senderEmail=await senderFor("password_reset");
  const payload=await sensitiveEmailPayload(request,mailId,"password_reset",emailPayload({template:"password_link",token:raw,expiresAt:expiresAt.toISOString(),message:"Sie wurden als Mitarbeiter der RescueEd Alert Unternehmerplattform eingeladen. Legen Sie über diesen einmaligen Link Ihr Passwort fest."}));
  await db.batch([
   db.insert(users).values({id:userId,organizationId:auth.user!.organizationId,fullName:name,email,passwordHash:await hashSecret(crypto.randomUUID()+crypto.randomUUID()),role:"platform_staff",status:"blocked",createdAt:now}),
   db.insert(securityTokens).values({id:id("sec"),userId,purpose:"password_setup",tokenHash:await tokenHash(raw),expiresAt,createdAt:now}),
   db.insert(emailOutbox).values({id:mailId,userId,type:"password_reset",senderEmail,recipientEmail:email,subject:"RescueEd Alert – Mitarbeiterzugang einrichten",payloadJson:payload,sensitiveExpiresAt:expiresAt,createdAt:now}),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:"platform_staff.invited",entityType:"user",entityId:userId,createdAt:now})
  ]);
  return Response.json({ok:true,previewUrl:process.env.NODE_ENV==="production"?undefined:`/password-reset?token=${encodeURIComponent(raw)}`},{status:201,headers:{"cache-control":"no-store"}});
 }catch(error){console.error("platform_staff_invite_failed",error);return Response.json({error:"Mitarbeiterzugang konnte nicht angelegt werden."},{status:500})}
}
