import {sql} from "drizzle-orm";
import {getDb,withImmediateTransaction} from "@/db";
import {checkInPlannedHelper,hasEventDutyPlan} from "@/lib/duty-manual-checkin";
import {DutyPlanConflict} from "@/lib/duty-plan";
import {normalizeDutyCode} from "@/lib/duty-secret-crypto";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {eventAuthenticated,ownedEvent} from "@/lib/event-access";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";

export async function GET(_request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{
  const {eventId}=await params,authorization=await ownedEvent(eventId),{event,permissions}=authorization;
  if(!eventAuthenticated(authorization))return Response.json({error:"Bitte zuerst anmelden."},{status:401});
  if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});
  if(!permissions?.manageHelpers)return Response.json({error:"Keine Berechtigung zur Helfererfassung."},{status:403});
  const result=withImmediateTransaction(connection=>({
   usesDutyPlan:hasEventDutyPlan(connection,event.id),
   bookings:connection.prepare(`SELECT b.id,b.first_name AS firstName,b.last_name AS lastName,s.title,s.start_at AS startAt,s.end_at AS endAt FROM duty_bookings b JOIN duty_shifts s ON s.id=b.shift_id WHERE s.event_id=? AND b.helper_id IS NULL AND b.redeemed_at IS NULL ORDER BY s.start_at,b.last_name,b.first_name`).all(event.id)
  }));
  return Response.json(result,{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("helper_options_failed",error);return Response.json({error:"Dienstplaneinträge konnten nicht geladen werden."},{status:500})}
}

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {eventId}=await params,authorization=await ownedEvent(eventId),{event,permissions}=authorization;
  if(!eventAuthenticated(authorization))return Response.json({error:"Bitte zuerst anmelden."},{status:401});
  if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});
  if(!permissions?.manageHelpers)return Response.json({error:"Dieser Event-Zugang darf keine Helfer anlegen."},{status:403});
  const body=await request.json() as {firstName?:string;lastName?:string;qualification?:string;phone?:string;dutyCode?:unknown;bookingId?:unknown};
  const usesDutyPlan=withImmediateTransaction(connection=>hasEventDutyPlan(connection,event.id));
  if(usesDutyPlan||body.dutyCode!==undefined||body.bookingId!==undefined){
   if(!usesDutyPlan)return Response.json({error:"Dieses Event hat keinen Dienstplan."},{status:400});
   const bookingId=typeof body.bookingId==="string"?body.bookingId.trim():"",dutyCode=typeof body.dutyCode==="string"?normalizeDutyCode(body.dutyCode):"";
   if((!bookingId&&!/^\d{8}$/.test(dutyCode))||(bookingId&&body.dutyCode!==undefined)||bookingId.length>100)return Response.json({error:"Bitte einen achtstelligen Dienstcode eingeben oder einen Dienst auswählen."},{status:400});
   const limit=await consumeRateLimit({scope:"organizer-duty-checkin",subject:`${requestNetwork(request)}:${event.id}`,limit:60,windowMs:10*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
   const helperId=id("hlp"),registeredAt=new Date(),sessionTokenHash=await tokenHash(crypto.randomUUID()+crypto.randomUUID()),codeHash=dutyCode?await tokenHash(dutyCode):undefined;
   withImmediateTransaction(connection=>checkInPlannedHelper(connection,{eventId:event.id,bookingId:bookingId||undefined,codeHash,helperId,sessionTokenHash,registeredAt:registeredAt.getTime()}));
   return Response.json({ok:true,helperId,registeredAt:registeredAt.toISOString()},{status:201});
  }
  const firstName=body.firstName?.trim(),lastName=body.lastName?.trim(),qualification=body.qualification?.trim(),phone=body.phone?.trim()||null;
  if(!firstName||!lastName||!qualification)return Response.json({error:"Bitte Vorname, Nachname und Qualifikation angeben."},{status:400});
  if(firstName.length>80||lastName.length>80||qualification.length>100||(phone?.length||0)>40)return Response.json({error:"Eine Eingabe ist zu lang."},{status:400});
  if(phone&&!/^[0-9+()/.\s-]{3,40}$/.test(phone))return Response.json({error:"Bitte eine gültige Telefonnummer angeben oder das freiwillige Feld leer lassen."},{status:400});
  const name=`${firstName} ${lastName}`;
  const db=getDb(),helperId=id("hlp"),registeredAt=new Date(),sessionTokenHash=await tokenHash(crypto.randomUUID()+crypto.randomUUID());
  const inserted=await db.all(sql`INSERT INTO helpers (id,event_id,assignment_id,name,first_name,last_name,qualification,phone,session_token_hash,registration_source,registered_at,removed_at)
    SELECT ${helperId},${event.id},NULL,${name},${firstName},${lastName},${qualification},${phone},${sessionTokenHash},'manual',${registeredAt.getTime()},NULL
    WHERE ((SELECT COUNT(*) FROM duty_bookings db JOIN duty_shifts ds ON ds.id=db.shift_id WHERE ds.event_id=${event.id}) + (SELECT COALESCE(SUM(ds.reserved_count),0) FROM duty_shifts ds WHERE ds.event_id=${event.id}) + (SELECT COUNT(*) FROM helpers h WHERE h.event_id=${event.id} AND h.removed_at IS NULL AND NOT EXISTS (SELECT 1 FROM duty_bookings linked WHERE linked.helper_id=h.id))) < ${event.helperLimit}
    AND NOT EXISTS (SELECT 1 FROM duty_shifts WHERE event_id=${event.id})
    AND NOT EXISTS (SELECT 1 FROM helpers WHERE event_id=${event.id} AND removed_at IS NULL AND lower(trim(name))=lower(trim(${name}))) RETURNING id`);
  if(inserted.length!==1)return Response.json({error:"Die maximale Helferzahl ist erreicht oder diese Person bereits anwesend."},{status:409});
  return Response.json({ok:true,helperId,registeredAt:registeredAt.toISOString()},{status:201});
 }catch(error){if(error instanceof DutyPlanConflict)return Response.json({error:error.message},{status:409});console.error("helper_creation_failed",error);return Response.json({error:"Helfer konnte nicht angelegt werden."},{status:500})}
}
