import {and,eq,gt,isNull} from "drizzle-orm";
import {getDb,withImmediateTransaction} from "@/db";
import {dutyBookings,dutyShifts,eventAccessCodes,eventAccessSessions,events} from "@/db/schema";
import {attendanceWindowOpen} from "@/lib/attendance-window";
import {DutyCodeConflict,redeemDutyCode} from "@/lib/duty-code-checkin";
import {permissionsForRole} from "@/lib/event-access";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const body=await request.json() as {code?:unknown},code=typeof body.code==="string"?body.code.trim().toUpperCase().replace(/[\s-]/g,""):"";
  if(!/^(?:[A-HJ-NP-Z2-9]{8}|[0-9]{8})$/.test(code))return Response.json({error:"Bitte einen gültigen achtstelligen Dienst- oder Freigabecode eingeben."},{status:400});
  const network=requestNetwork(request),limit=await consumeRateLimit({scope:"event-code-network",subject:network,limit:20,windowMs:15*60_000});
  if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const now=new Date(),db=getDb(),codeHash=await tokenHash(code);
  const [access]=await db.select({id:eventAccessCodes.id,eventId:eventAccessCodes.eventId,role:eventAccessCodes.role,expiresAt:eventAccessCodes.expiresAt}).from(eventAccessCodes).innerJoin(events,eq(events.id,eventAccessCodes.eventId)).where(and(eq(eventAccessCodes.codeHash,codeHash),gt(eventAccessCodes.expiresAt,now),isNull(eventAccessCodes.revokedAt),eq(events.status,"active"))).limit(1);
  if(/^\d{8}$/.test(code)){
   const dutyLimit=await consumeRateLimit({scope:"duty-login-network",subject:network,limit:8,windowMs:10*60_000,blockMs:30*60_000});if(!dutyLimit.allowed)return rateLimited(dutyLimit.retryAfterSeconds);
   const [planned]=await db.select({event:events}).from(dutyBookings).innerJoin(dutyShifts,eq(dutyShifts.id,dutyBookings.shiftId)).innerJoin(events,eq(events.id,dutyShifts.eventId)).where(eq(dutyBookings.codeHash,codeHash)).limit(1);
   // Numeric legacy access codes exist. Never grant a role on an ambiguous code.
   if(access&&planned)return Response.json({error:"Code nicht eindeutig. Bitte den Veranstalter kontaktieren."},{status:409});
   if(planned){
    if(!attendanceWindowOpen(planned.event,now))return Response.json({error:"Code ungültig oder außerhalb der Einbuchungszeit."},{status:401});
    const helperToken=crypto.randomUUID()+crypto.randomUUID(),sessionTokenHash=await tokenHash(helperToken),helperId=id("hlp");
    const linked=withImmediateTransaction(connection=>redeemDutyCode(connection,{eventId:planned.event.id,codeHash,helperId,sessionTokenHash,registeredAt:now.getTime()}));
    return Response.json({ok:true,flow:"helper_checked_in",eventId:planned.event.id,helperId:linked,helperToken},{status:201,headers:{"cache-control":"no-store"}});
   }
  }
  if(!access)return Response.json({error:"Code ungültig oder abgelaufen."},{status:401});
  if(access.role==="helper_attendance"){
   await db.update(eventAccessCodes).set({lastUsedAt:now}).where(eq(eventAccessCodes.id,access.id));
   return Response.json({ok:true,flow:"helper_attendance",eventId:access.eventId},{headers:{"cache-control":"no-store"}});
  }
  const raw=crypto.randomUUID()+crypto.randomUUID(),sessionExpiry=new Date(Math.min(access.expiresAt.getTime(),now.getTime()+8*60*60_000));
  await db.batch([db.insert(eventAccessSessions).values({id:id("eas"),accessCodeId:access.id,tokenHash:await tokenHash(raw),expiresAt:sessionExpiry,createdAt:now}),db.update(eventAccessCodes).set({lastUsedAt:now}).where(eq(eventAccessCodes.id,access.id))]);
  const secure=new URL(request.url).protocol==="https:"||process.env.NODE_ENV==="production"?"; Secure":"";
  const headers=new Headers({"content-type":"application/json","cache-control":"no-store"});
  headers.append("set-cookie",`rescueed_event_session=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1,Math.floor((sessionExpiry.getTime()-now.getTime())/1000))}${secure}`);
  headers.append("set-cookie",`rescueed_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
  return new Response(JSON.stringify({ok:true,eventId:access.eventId,role:access.role,permissions:permissionsForRole(access.role)}),{headers});
 }catch(error){if(error instanceof DutyCodeConflict)return Response.json({error:error.message},{status:409});console.error("event_code_login_failed",error);return Response.json({error:"Event-Zugang konnte nicht geöffnet werden."},{status:500})}
}
