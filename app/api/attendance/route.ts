import {and,eq,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {events,helpers} from "@/db/schema";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";

type Action="come"|"leave";
async function publicEvent(eventId:string,code:string,action:Action){const [event]=await getDb().select().from(events).where(and(eq(events.id,eventId),eq(action==="come"?events.checkInCode:events.checkOutCode,code))).limit(1);return event||null}

export async function GET(request:Request){
 try{const url=new URL(request.url),eventId=url.searchParams.get("eventId")||"",code=url.searchParams.get("code")||"",action=url.searchParams.get("mode")==="leave"?"leave":"come",event=await publicEvent(eventId,code,action);if(!event)return Response.json({error:"Dieser QR-Code ist ungültig oder nicht mehr aktiv."},{status:404});return Response.json({event:{id:event.id,name:event.name,eventDate:event.eventDate,startTime:event.startTime,endTime:event.endTime},action})}catch(error){console.error("attendance_info_failed",error);return Response.json({error:"Event konnte nicht geladen werden."},{status:500})}
}

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const body=await request.json() as {eventId?:string;code?:string;action?:Action;firstName?:string;lastName?:string;qualification?:string;helperToken?:string},action=body.action==="leave"?"leave":"come";
  if(!body.eventId||!body.code)return Response.json({error:"QR-Code unvollständig."},{status:400});
  const event=await publicEvent(body.eventId,body.code,action);if(!event)return Response.json({error:"Dieser QR-Code ist ungültig oder nicht mehr aktiv."},{status:404});
  const db=getDb(),now=new Date();
  if(action==="come"){
   const firstName=body.firstName?.trim(),lastName=body.lastName?.trim(),qualification=body.qualification?.trim();
   if(!firstName||!lastName||!qualification)return Response.json({error:"Bitte Vorname, Nachname und Qualifikation angeben."},{status:400});
   if(firstName.length>80||lastName.length>80||qualification.length>100)return Response.json({error:"Eine Eingabe ist zu lang."},{status:400});
   const present=await db.select({id:helpers.id,name:helpers.name}).from(helpers).where(and(eq(helpers.eventId,event.id),isNull(helpers.removedAt)));
   if(present.length>=event.helperLimit)return Response.json({error:"Die maximale Helferzahl für dieses Event ist erreicht."},{status:409});
   const duplicate=present.some(person=>person.name.localeCompare(`${firstName} ${lastName}`,"de",{sensitivity:"base"})===0);if(duplicate)return Response.json({error:"Diese Person ist bereits eingecheckt."},{status:409});
   const helperToken=crypto.randomUUID()+crypto.randomUUID(),helperId=id("hlp");
   await db.insert(helpers).values({id:helperId,eventId:event.id,name:`${firstName} ${lastName}`,firstName,lastName,qualification,sessionTokenHash:await tokenHash(helperToken),registeredAt:now});
   return Response.json({ok:true,helperId,helperToken,arrivedAt:now.toISOString()},{status:201});
  }
  if(!body.helperToken)return Response.json({error:"Auf diesem Gerät wurde kein aktiver Check-in gefunden."},{status:400});
  const [person]=await db.select({id:helpers.id}).from(helpers).where(and(eq(helpers.eventId,event.id),eq(helpers.sessionTokenHash,await tokenHash(body.helperToken)),isNull(helpers.removedAt))).limit(1);
  if(!person)return Response.json({error:"Der Check-in wurde nicht gefunden oder bereits beendet."},{status:404});
  await db.update(helpers).set({removedAt:now}).where(eq(helpers.id,person.id));
  return Response.json({ok:true,leftAt:now.toISOString()});
 }catch(error){console.error("attendance_update_failed",error);return Response.json({error:"Anwesenheit konnte nicht gespeichert werden."},{status:500})}
}
