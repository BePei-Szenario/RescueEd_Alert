import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {helperDevices} from "@/db/schema";
import {activeMobileHelper} from "@/lib/mobile-helper-session";
import {encryptPushToken} from "@/lib/push-token-crypto";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";

const platforms=new Set(["android","ios"]),tones=new Set(["piep_piep","doodoo","reverb","sirene","vollalarm","vibration"]);

export async function POST(request:Request){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 try{
  const body=await request.json() as {eventId?:unknown;token?:unknown;platform?:unknown;alarmTone?:unknown};
  const eventId=typeof body.eventId==="string"?body.eventId:"",token=typeof body.token==="string"?body.token.trim():"",platform=typeof body.platform==="string"?body.platform:"",alarmTone=typeof body.alarmTone==="string"&&tones.has(body.alarmTone)?body.alarmTone:"piep_piep";
  if(!eventId||!token||token.length>4096||!platforms.has(platform))return Response.json({error:"Ungültige Push-Gerätedaten."},{status:400});
  const helper=await activeMobileHelper(request,eventId);if(!helper)return Response.json({error:"Der temporäre Zugang ist ungültig oder beendet."},{status:401});
  const db=getDb(),hash=await tokenHash(token),now=new Date(),encrypted=await encryptPushToken(token,helper.helperId,platform);
  await db.insert(helperDevices).values({id:id("dev"),helperId:helper.helperId,platform:platform as "android"|"ios",alarmTone,pushProvider:"fcm",pushTokenHash:hash,pushTokenEncrypted:encrypted,registeredAt:now,lastSeenAt:now,lastPushAt:null,pushFailures:0,disabledAt:null}).onConflictDoUpdate({target:helperDevices.pushTokenHash,set:{helperId:helper.helperId,platform:platform as "android"|"ios",alarmTone,pushProvider:"fcm",pushTokenEncrypted:encrypted,registeredAt:now,lastSeenAt:now,pushFailures:0,disabledAt:null}});
  return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("push_device_register_failed",error);return Response.json({error:"Push-Benachrichtigungen konnten nicht registriert werden."},{status:500})}
}

export async function DELETE(request:Request){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 try{
  const body=await request.json() as {eventId?:unknown},eventId=typeof body.eventId==="string"?body.eventId:"";
  if(!eventId)return Response.json({error:"Event-ID fehlt."},{status:400});
  const helper=await activeMobileHelper(request,eventId);if(!helper)return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
  await getDb().delete(helperDevices).where(eq(helperDevices.helperId,helper.helperId));
  return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("push_device_unregister_failed",error);return Response.json({error:"Push-Benachrichtigungen konnten nicht abgemeldet werden."},{status:500})}
}
