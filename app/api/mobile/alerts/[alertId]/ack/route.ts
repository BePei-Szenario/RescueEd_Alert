import {and,eq,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {alertRecipients,alerts} from "@/db/schema";
import {activeMobileHelper} from "@/lib/mobile-helper-session";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";

export async function PATCH(request:Request,{params}:{params:Promise<{alertId:string}>}){
 try{
  const {alertId}=await params;
  const body=await request.json() as {eventId?:unknown};
  if(typeof body.eventId!=="string")return Response.json({error:"Event-ID fehlt."},{status:400});
  const helper=await activeMobileHelper(request,body.eventId);
  if(!helper)return Response.json({error:"Der temporäre Zugang ist ungültig oder beendet."},{status:401});
  const limit=await consumeRateLimit({scope:"mobile-alert-ack",subject:`${helper.helperId}:${requestNetwork(request)}`,limit:60,windowMs:10*60_000});
  if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const db=getDb(),now=new Date();
  const updated=await db.update(alertRecipients).set({acknowledgedAt:now}).where(and(
   eq(alertRecipients.alertId,alertId),eq(alertRecipients.helperId,helper.helperId),isNull(alertRecipients.acknowledgedAt)
  )).returning({id:alertRecipients.id});
  if(updated.length===0){
   const [existing]=await db.select({id:alertRecipients.id,acknowledgedAt:alertRecipients.acknowledgedAt}).from(alertRecipients).innerJoin(alerts,eq(alerts.id,alertRecipients.alertId)).where(and(eq(alertRecipients.alertId,alertId),eq(alertRecipients.helperId,helper.helperId),eq(alerts.eventId,body.eventId))).limit(1);
   if(!existing)return Response.json({error:"Alarmierung nicht gefunden."},{status:404});
   return Response.json({ok:true,acknowledgedAt:existing.acknowledgedAt});
  }
  return Response.json({ok:true,acknowledgedAt:now});
 }catch(error){console.error("mobile_alert_ack_failed",error);return Response.json({error:"Alarmierung konnte nicht bestätigt werden."},{status:500})}
}
