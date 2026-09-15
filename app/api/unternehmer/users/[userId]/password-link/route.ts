import {getDb} from "@/db";
import {auditLogs,emailOutbox,securityTokens,users} from "@/db/schema";
import {eq} from "drizzle-orm";
import {id,tokenHash} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {senderFor} from "@/lib/email-settings";
import {emailPayload} from "@/lib/email-signature";

export async function POST(request:Request,{params}:{params:Promise<{userId:string}>}){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
  const {userId}=await params,db=getDb(),[user]=await db.select({email:users.email,status:users.status}).from(users).where(eq(users.id,userId)).limit(1);
  if(!user||user.status==="deleted")return Response.json({error:"Aktives Konto nicht gefunden."},{status:404});
  const raw=crypto.randomUUID()+crypto.randomUUID(),now=new Date(),expiresAt=new Date(now.getTime()+30*60*1000),senderEmail=await senderFor("password_reset"),mailId=id("mail");
  const payload=await sensitiveEmailPayload(request,mailId,"password_reset",emailPayload({template:"password_link",token:raw,expiresAt:expiresAt.toISOString(),message:"Über diesen einmaligen Link können Sie Ihr Passwort sicher festlegen."}));
  await db.batch([
   db.insert(securityTokens).values({id:id("sec"),userId,purpose:"password_reset",tokenHash:await tokenHash(raw),expiresAt,createdAt:now}),
   db.insert(emailOutbox).values({id:mailId,userId,type:"password_reset",senderEmail,recipientEmail:user.email,subject:"RescueEd Alert – Passwort festlegen",payloadJson:payload,sensitiveExpiresAt:expiresAt,createdAt:now}),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:"password_link.created",entityType:"user",entityId:userId,createdAt:now})
  ]);
  return Response.json({ok:true,expiresAt,previewToken:process.env.NODE_ENV==="production"?undefined:raw});
 }catch(error){console.error("password_link_failed",error);return Response.json({error:"Passwortlink konnte nicht erstellt werden."},{status:500})}
}
