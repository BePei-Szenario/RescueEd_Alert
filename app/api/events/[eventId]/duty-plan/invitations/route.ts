import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {dutyInvitations,emailOutbox,organizations} from "@/db/schema";
import {encryptDutyEmail,hashDutyEmail,normalizeDutyEmail} from "@/lib/duty-secret-crypto";
import {cleanDutyText,validDutyEmail} from "@/lib/duty-plan";
import {senderFor} from "@/lib/email-settings";
import {eventAuthenticated,ownedEvent} from "@/lib/event-access";
import {consumeRateLimit,rateLimited} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {outboxPayloadExpiresAt,sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {id,tokenHash} from "@/lib/security";

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 try{
  const {eventId}=await params,authorization=await ownedEvent(eventId);if(!eventAuthenticated(authorization))return Response.json({error:"Bitte zuerst anmelden."},{status:401});if(!authorization.event)return Response.json({error:"Event nicht gefunden."},{status:404});if(!authorization.user||!authorization.permissions?.manageAssignments)return Response.json({error:"Dieser Zugang darf keine Einladungen versenden."},{status:403});
  const db=getDb(),[organization]=await db.select({name:organizations.name,enabled:organizations.dutyPlanEnabled,signature:organizations.dutyEmailSignature}).from(organizations).where(eq(organizations.id,authorization.event.organizationId)).limit(1);if(!organization?.enabled)return Response.json({error:"Das Dienstplan-Modul ist nicht freigeschaltet."},{status:403});
  if(!organization.signature.trim())return Response.json({error:"Bitte zuerst die eigene E-Mail-Signatur im Dienstplan speichern."},{status:409});
  const limit=await consumeRateLimit({scope:"duty-invitation",subject:authorization.user.id,limit:50,windowMs:60*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const body=await request.json() as {email?:unknown;organizerNote?:unknown},email=normalizeDutyEmail(typeof body.email==="string"?body.email:""),organizerNote=cleanDutyText(body.organizerNote,1000)||null;if(!validDutyEmail(email))return Response.json({error:"Bitte eine gültige E-Mail-Adresse angeben."},{status:400});
  const invitationId=id("din"),mailId=id("mail"),raw=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-",""),now=new Date(),expiresAt=new Date(now.getTime()+60*60_000),origin=new URL(request.url).origin,url=`${origin}/dienstplan/${encodeURIComponent(raw)}`,senderEmail=await senderFor("mfa");
  const payload=await sensitiveEmailPayload(request,mailId,"duty_invitation",JSON.stringify({template:"duty_invitation",message:`Sie wurden eingeladen, freie Dienste für „${authorization.event.name}“ auszuwählen.`,invitationUrl:url,expiresAt:expiresAt.toISOString(),organizationName:organization.name,customerSignature:organization.signature}));
  await db.batch([
   db.insert(dutyInvitations).values({id:invitationId,eventId:authorization.event.id,emailHash:await hashDutyEmail(email),emailEncrypted:await encryptDutyEmail(email,"invitation",invitationId,authorization.event.id),tokenHash:await tokenHash(raw),expiresAt,organizerNote,createdByUserId:authorization.user.id,createdAt:now}),
   db.insert(emailOutbox).values({id:mailId,userId:authorization.user.id,eventId:authorization.event.id,type:"duty_invitation",senderEmail,recipientEmail:email,subject:`Dienstplan-Einladung · ${authorization.event.name}`,payloadJson:payload,sensitiveExpiresAt:outboxPayloadExpiresAt(now),createdAt:now})
  ]);
  return Response.json({ok:true,invitation:{id:invitationId,expiresAt}},{status:201});
 }catch(error){console.error("duty_invitation_create_failed",error);return Response.json({error:"Einladung konnte nicht versendet werden."},{status:500})}
}
