import {and,eq,isNull,sql} from "drizzle-orm";
import {getDb} from "@/db";
import {events,helpers} from "@/db/schema";
import {attendanceWindowOpen} from "@/lib/attendance-window";
import {effectiveEventEndDate} from "@/lib/event-duration";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";

type Action="come"|"leave";
async function publicEvent(eventId:string,code:string,action:Action){const [event]=await getDb().select().from(events).where(and(eq(events.id,eventId),eq(action==="come"?events.checkInCode:events.checkOutCode,code),eq(events.status,"active"))).limit(1);return event&&attendanceWindowOpen(event)?event:null}

export async function GET(request:Request){
 try{const url=new URL(request.url),eventId=url.searchParams.get("eventId")||"",code=url.searchParams.get("code")||"",action=url.searchParams.get("mode")==="leave"?"leave":"come",event=await publicEvent(eventId,code,action);if(!event)return Response.json({error:"Dieser QR-Code ist ungültig oder nicht mehr aktiv."},{status:404});return Response.json({event:{id:event.id,name:event.name,eventDate:event.eventDate,endDate:effectiveEventEndDate(event.eventDate,event.startTime,event.endDate,event.endTime),startTime:event.startTime,endTime:event.endTime},action})}catch(error){console.error("attendance_info_failed",error);return Response.json({error:"Event konnte nicht geladen werden."},{status:500})}
}

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const limit=await consumeRateLimit({scope:"attendance-network",subject:requestNetwork(request),limit:120,windowMs:10*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const body=await request.json() as {eventId?:string;code?:string;action?:Action;firstName?:string;lastName?:string;qualification?:string;helperToken?:string},action=body.action==="leave"?"leave":"come";
  if(!body.eventId||!body.code)return Response.json({error:"QR-Code unvollständig."},{status:400});
  const event=await publicEvent(body.eventId,body.code,action);if(!event)return Response.json({error:"Dieser QR-Code ist ungültig oder nicht mehr aktiv."},{status:404});
  const db=getDb(),now=new Date();
  if(action==="come"){
   const firstName=body.firstName?.trim(),lastName=body.lastName?.trim(),qualification=body.qualification?.trim();
   if(!firstName||!lastName||!qualification)return Response.json({error:"Bitte Vorname, Nachname und Qualifikation angeben."},{status:400});
   if(firstName.length>80||lastName.length>80||qualification.length>100)return Response.json({error:"Eine Eingabe ist zu lang."},{status:400});
    const helperToken=crypto.randomUUID()+crypto.randomUUID(),helperId=id("hlp"),name=`${firstName} ${lastName}`,sessionTokenHash=await tokenHash(helperToken);
    const inserted=await db.run(sql`INSERT INTO helpers (id,event_id,assignment_id,name,first_name,last_name,qualification,session_token_hash,registered_at,removed_at)
      SELECT ${helperId},${event.id},NULL,${name},${firstName},${lastName},${qualification},${sessionTokenHash},${now.getTime()},NULL
      WHERE (SELECT COUNT(*) FROM helpers WHERE event_id=${event.id} AND removed_at IS NULL) < ${event.helperLimit}
      AND NOT EXISTS (SELECT 1 FROM helpers WHERE event_id=${event.id} AND removed_at IS NULL AND lower(trim(name))=lower(trim(${name})))`);
    if((inserted.meta?.changes??0)!==1)return Response.json({error:"Die maximale Helferzahl ist erreicht oder diese Person bereits eingecheckt."},{status:409});
   return Response.json({ok:true,helperId,helperToken,arrivedAt:now.toISOString()},{status:201});
  }
  if(!body.helperToken)return Response.json({error:"Auf diesem Gerät wurde kein aktiver Check-in gefunden."},{status:400});
  const [person]=await db.select({id:helpers.id}).from(helpers).where(and(eq(helpers.eventId,event.id),eq(helpers.sessionTokenHash,await tokenHash(body.helperToken)),isNull(helpers.removedAt))).limit(1);
  if(!person)return Response.json({error:"Der Check-in wurde nicht gefunden oder bereits beendet."},{status:404});
  await db.update(helpers).set({removedAt:now}).where(eq(helpers.id,person.id));
  return Response.json({ok:true,leftAt:now.toISOString()});
 }catch(error){console.error("attendance_update_failed",error);return Response.json({error:"Anwesenheit konnte nicht gespeichert werden."},{status:500})}
}
