import {getDb} from "@/db";
import {auditLogs,emailSenderSettings} from "@/db/schema";
import {id} from "@/lib/security";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {requirePlatformOwnerApi} from "@/lib/session";
const actions=["mfa","registration_link","password_reset","customer_contact"] as const;
export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
  const body=await request.json() as {settings?:Record<string,string>;displayName?:string};
  const displayName=body.displayName?.trim()||"RescueEd Alert",settings=body.settings||{};
  for(const action of actions){const email=settings[action]?.trim().toLowerCase();if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:`Ungültige E-Mail-Adresse für ${action}.`},{status:400})}
  const db=getDb(),now=new Date();
  for(const action of actions)await db.insert(emailSenderSettings).values({action,senderEmail:settings[action].trim().toLowerCase(),displayName,updatedByUserId:auth.user!.id,updatedAt:now}).onConflictDoUpdate({target:emailSenderSettings.action,set:{senderEmail:settings[action].trim().toLowerCase(),displayName,updatedByUserId:auth.user!.id,updatedAt:now}});
  await db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:"email_settings.updated",entityType:"email_settings",createdAt:now});
  return Response.json({ok:true});
 }catch(error){console.error("email_settings_failed",error);return Response.json({error:"E-Mail-Einstellungen konnten nicht gespeichert werden."},{status:500})}
}
