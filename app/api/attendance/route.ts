import {and,eq,gt,isNull,sql} from "drizzle-orm";
import {getDb,withImmediateTransaction} from "@/db";
import {eventAccessCodes,events,helperDevices,helpers} from "@/db/schema";
import {attendanceWindowOpen} from "@/lib/attendance-window";
import {normalizeDutyCode} from "@/lib/duty-secret-crypto";
import {effectiveEventEndDate} from "@/lib/event-duration";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";

type Action="come"|"leave";
class DutyCodeConflict extends Error{}
async function publicEvent(eventId:string,code:string,action:Action){
 const db=getDb(),now=new Date();
 const [event]=await db.select().from(events).where(and(eq(events.id,eventId),eq(action==="come"?events.checkInCode:events.checkOutCode,code),eq(events.status,"active"))).limit(1);
 if(event&&attendanceWindowOpen(event))return event;
 if(action==="leave")return null;
 const [codeEvent]=await db.select({event:events}).from(eventAccessCodes).innerJoin(events,eq(events.id,eventAccessCodes.eventId)).where(and(eq(eventAccessCodes.eventId,eventId),eq(eventAccessCodes.role,"helper_attendance"),eq(eventAccessCodes.codeHash,await tokenHash(code.trim().toUpperCase().replace(/[\s-]/g,""))),gt(eventAccessCodes.expiresAt,now),isNull(eventAccessCodes.revokedAt),eq(events.status,"active"))).limit(1);
 return codeEvent?.event&&attendanceWindowOpen(codeEvent.event)?codeEvent.event:null;
}

export async function GET(request:Request){
 try{const url=new URL(request.url),eventId=url.searchParams.get("eventId")||"",code=url.searchParams.get("code")||"",action=url.searchParams.get("mode")==="leave"?"leave":"come",event=await publicEvent(eventId,code,action);if(!event)return Response.json({error:"Dieser QR-Code ist ungültig oder nicht mehr aktiv."},{status:404});return Response.json({event:{id:event.id,name:event.name,eventDate:event.eventDate,endDate:effectiveEventEndDate(event.eventDate,event.startTime,event.endDate,event.endTime),startTime:event.startTime,endTime:event.endTime},action})}catch(error){console.error("attendance_info_failed",error);return Response.json({error:"Event konnte nicht geladen werden."},{status:500})}
}

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const limit=await consumeRateLimit({scope:"attendance-network",subject:requestNetwork(request),limit:120,windowMs:10*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const body=await request.json() as {eventId?:string;code?:string;action?:Action;checkInMethod?:"duty-code"|"spontaneous";dutyCode?:unknown;firstName?:string;lastName?:string;qualification?:string;phone?:string;helperToken?:string},action=body.action==="leave"?"leave":"come";
  if(!body.eventId||!body.code)return Response.json({error:"QR-Code unvollständig."},{status:400});
  const event=await publicEvent(body.eventId,body.code,action);if(!event)return Response.json({error:"Dieser QR-Code ist ungültig oder nicht mehr aktiv."},{status:404});
  const db=getDb(),now=new Date();
  if(action==="come"){
   if(body.checkInMethod==="duty-code"){
    const dutyCode=normalizeDutyCode(typeof body.dutyCode==="string"?body.dutyCode:"");
    if(!/^\d{8}$/.test(dutyCode))return Response.json({error:"Bitte den achtstelligen persönlichen Dienstcode eingeben."},{status:400});
    const codeLimit=await consumeRateLimit({scope:"attendance-duty-code",subject:`${requestNetwork(request)}:${event.id}`,limit:8,windowMs:10*60_000,blockMs:30*60_000});if(!codeLimit.allowed)return rateLimited(codeLimit.retryAfterSeconds);
    const helperToken=crypto.randomUUID()+crypto.randomUUID(),sessionTokenHash=await tokenHash(helperToken),codeHash=await tokenHash(dutyCode),helperId=id("hlp"),registeredAt=now.getTime();
    const linked=withImmediateTransaction(connection=>{
     const booking=connection.prepare(`SELECT db.id,db.first_name,db.last_name,db.qualification,db.helper_id,ds.assignment_id,e.helper_limit,h.registration_source AS linked_source,h.removed_at AS linked_removed_at FROM duty_bookings db JOIN duty_shifts ds ON ds.id=db.shift_id JOIN events e ON e.id=ds.event_id LEFT JOIN helpers h ON h.id=db.helper_id WHERE ds.event_id=? AND db.code_hash=? AND db.redeemed_at IS NULL AND e.status='active' AND (db.helper_id IS NULL OR (h.event_id=ds.event_id AND h.registration_source='manual' AND h.removed_at IS NULL)) LIMIT 1`).get(event.id,codeHash) as {id:string;first_name:string;last_name:string;qualification:string|null;helper_id:string|null;assignment_id:string;helper_limit:number;linked_source:string|null;linked_removed_at:number|null}|undefined;
     if(!booking)throw new DutyCodeConflict("Dieser Dienstcode ist ungültig oder wurde bereits verwendet.");
     const manualMatches=booking.helper_id?[{id:booking.helper_id}]:connection.prepare(`SELECT id FROM helpers WHERE event_id=? AND removed_at IS NULL AND registration_source='manual' AND lower(trim(COALESCE(first_name,'')))=lower(trim(?)) AND lower(trim(COALESCE(last_name,'')))=lower(trim(?)) ORDER BY registered_at DESC LIMIT 2`).all(event.id,booking.first_name,booking.last_name) as Array<{id:string}>;
     if(manualMatches.length>1)throw new DutyCodeConflict("Mehrere manuelle Einträge haben denselben Namen. Bitte zuerst den Veranstalter um eindeutige Zuordnung bitten.");
     const manual=manualMatches[0],targetId=manual?.id||helperId;
     if(manual){
      const updated=connection.prepare(`UPDATE helpers SET assignment_id=?,name=?,first_name=?,last_name=?,qualification=?,session_token_hash=?,registration_source='qr',registered_at=? WHERE id=? AND event_id=? AND removed_at IS NULL AND registration_source='manual'`).run(booking.assignment_id,`${booking.first_name} ${booking.last_name}`,booking.first_name,booking.last_name,booking.qualification||"Nicht angegeben",sessionTokenHash,registeredAt,manual.id,event.id);
      if(Number(updated.changes)!==1)throw new DutyCodeConflict("Der manuelle Eintrag konnte nicht mit diesem Gerät verbunden werden.");
     }else{
      const active=(connection.prepare("SELECT COUNT(*) AS count FROM helpers WHERE event_id=? AND removed_at IS NULL").get(event.id) as {count:number}).count;
      if(Number(active)>=booking.helper_limit)throw new DutyCodeConflict("Die maximale Helferzahl des Events ist erreicht.");
      connection.prepare(`INSERT INTO helpers (id,event_id,assignment_id,name,first_name,last_name,qualification,phone,session_token_hash,registration_source,registered_at,removed_at) VALUES (?,?,?,?,?,?,?,?,?,'qr',?,NULL)`).run(targetId,event.id,booking.assignment_id,`${booking.first_name} ${booking.last_name}`,booking.first_name,booking.last_name,booking.qualification||"Nicht angegeben",null,sessionTokenHash,registeredAt);
     }
     const redeemed=connection.prepare("UPDATE duty_bookings SET helper_id=?,redeemed_at=? WHERE id=? AND redeemed_at IS NULL AND (helper_id IS NULL OR helper_id=?)").run(targetId,registeredAt,booking.id,targetId);
     if(Number(redeemed.changes)!==1)throw new DutyCodeConflict("Dieser Dienstcode wurde bereits verwendet.");
     return targetId;
    });
    return Response.json({ok:true,helperId:linked,helperToken,arrivedAt:now.toISOString(),planned:true},{status:201,headers:{"cache-control":"no-store"}});
   }
   const firstName=body.firstName?.trim(),lastName=body.lastName?.trim(),qualification=body.qualification?.trim(),phone=body.phone?.trim()||null;
   if(!firstName||!lastName||!qualification)return Response.json({error:"Bitte Vorname, Nachname und Qualifikation angeben."},{status:400});
   if(firstName.length>80||lastName.length>80||qualification.length>100||(phone?.length||0)>40)return Response.json({error:"Eine Eingabe ist zu lang."},{status:400});
   if(phone&&!/^[0-9+()/.\s-]{3,40}$/.test(phone))return Response.json({error:"Bitte eine gültige Telefonnummer angeben oder das freiwillige Feld leer lassen."},{status:400});
    const helperToken=crypto.randomUUID()+crypto.randomUUID(),helperId=id("hlp"),name=`${firstName} ${lastName}`,sessionTokenHash=await tokenHash(helperToken);
    const inserted=await db.all(sql`INSERT INTO helpers (id,event_id,assignment_id,name,first_name,last_name,qualification,phone,session_token_hash,registration_source,registered_at,removed_at)
      SELECT ${helperId},${event.id},NULL,${name},${firstName},${lastName},${qualification},${phone},${sessionTokenHash},'qr',${now.getTime()},NULL
      WHERE ((SELECT COUNT(*) FROM duty_bookings db JOIN duty_shifts ds ON ds.id=db.shift_id WHERE ds.event_id=${event.id}) + (SELECT COALESCE(SUM(ds.reserved_count),0) FROM duty_shifts ds WHERE ds.event_id=${event.id}) + (SELECT COUNT(*) FROM helpers h WHERE h.event_id=${event.id} AND h.removed_at IS NULL AND NOT EXISTS (SELECT 1 FROM duty_bookings linked WHERE linked.helper_id=h.id))) < ${event.helperLimit}
      AND NOT EXISTS (SELECT 1 FROM helpers WHERE event_id=${event.id} AND removed_at IS NULL AND lower(trim(name))=lower(trim(${name}))) RETURNING id`);
    if(inserted.length!==1)return Response.json({error:"Die maximale Helferzahl einschließlich gebuchter Dienste ist erreicht oder diese Person bereits eingecheckt."},{status:409});
   return Response.json({ok:true,helperId,helperToken,arrivedAt:now.toISOString(),planned:false},{status:201});
  }
  if(!body.helperToken)return Response.json({error:"Auf diesem Gerät wurde kein aktiver Check-in gefunden."},{status:400});
  const [person]=await db.select({id:helpers.id}).from(helpers).where(and(eq(helpers.eventId,event.id),eq(helpers.sessionTokenHash,await tokenHash(body.helperToken)),isNull(helpers.removedAt))).limit(1);
  if(!person)return Response.json({error:"Der Check-in wurde nicht gefunden oder bereits beendet."},{status:404});
  await db.batch([db.update(helpers).set({removedAt:now}).where(eq(helpers.id,person.id)),db.delete(helperDevices).where(eq(helperDevices.helperId,person.id))]);
  return Response.json({ok:true,leftAt:now.toISOString()});
 }catch(error){if(error instanceof DutyCodeConflict)return Response.json({error:error.message},{status:409,headers:{"cache-control":"no-store"}});console.error("attendance_update_failed",error);return Response.json({error:"Anwesenheit konnte nicht gespeichert werden."},{status:500})}
}
