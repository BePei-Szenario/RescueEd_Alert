import {and,eq,ne} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,emailOutbox,securityTokens,users} from "@/db/schema";
import {emailPayload} from "@/lib/email-signature";
import {senderFor} from "@/lib/email-settings";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {hashSecret,id,tokenHash} from "@/lib/security";
import {currentUser} from "@/lib/session";

export async function POST(request:Request){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 const owner=await currentUser();
 if(!owner||owner.role!=="customer"||owner.accountType!=="organization")return Response.json({error:"Nur das Hauptkonto kann einen Event-Benutzer einladen."},{status:403});
 try{
  const body=await request.json() as {name?:unknown;email?:unknown};
  const name=typeof body.name==="string"?body.name.trim():"",email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
  if(!name||name.length>160||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Bitte Name und gültige E-Mail-Adresse angeben."},{status:400});
  const db=getDb(),[existingMember]=await db.select({id:users.id}).from(users).where(and(eq(users.organizationId,owner.organizationId),eq(users.role,"organization_member"),ne(users.status,"deleted"))).limit(1);
  if(existingMember)return Response.json({error:"Für diese Organisation ist bereits ein zusätzlicher Benutzer vorhanden."},{status:409});
  const [existingEmail]=await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1);
  if(existingEmail)return Response.json({error:"Diese E-Mail-Adresse wird bereits verwendet."},{status:409});
  const userId=id("usr"),mailId=id("mail"),raw=crypto.randomUUID()+crypto.randomUUID(),now=new Date(),expiresAt=new Date(now.getTime()+30*60_000),senderEmail=await senderFor("password_reset");
  const payload=await sensitiveEmailPayload(request,mailId,"password_reset",emailPayload({template:"password_link",token:raw,expiresAt:expiresAt.toISOString(),message:"Ihre Organisation hat Sie als Event-Benutzer eingeladen. Legen Sie über diesen einmaligen Link Ihr Passwort fest."}));
  await db.batch([
   db.insert(users).values({id:userId,organizationId:owner.organizationId,fullName:name,email,passwordHash:await hashSecret(crypto.randomUUID()+crypto.randomUUID()),role:"organization_member",status:"blocked",createdAt:now}),
   db.insert(securityTokens).values({id:id("sec"),userId,purpose:"password_setup",tokenHash:await tokenHash(raw),expiresAt,createdAt:now}),
   db.insert(emailOutbox).values({id:mailId,userId,type:"password_reset",senderEmail,recipientEmail:email,subject:"RescueEd Alert – Event-Benutzer einrichten",payloadJson:payload,sensitiveExpiresAt:expiresAt,createdAt:now}),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:owner.id,action:"organization_member.invited",entityType:"user",entityId:userId,createdAt:now})
  ]);
  return Response.json({ok:true,previewUrl:process.env.NODE_ENV==="production"?undefined:`/password-reset?token=${encodeURIComponent(raw)}`},{status:201,headers:{"cache-control":"no-store"}});
 }catch(error){console.error("organization_member_invite_failed",error);return Response.json({error:"Event-Benutzer konnte nicht eingeladen werden."},{status:500})}
}
