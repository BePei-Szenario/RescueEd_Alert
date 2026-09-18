import {sql} from "drizzle-orm";
import {getDb} from "@/db";
import {ownedEvent} from "@/lib/event-access";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {eventId}=await params,{user,event}=await ownedEvent(eventId);
  if(!user)return Response.json({error:"Bitte zuerst anmelden."},{status:401});
  if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});
  const body=await request.json() as {firstName?:string;lastName?:string;qualification?:string};
  const firstName=body.firstName?.trim(),lastName=body.lastName?.trim(),qualification=body.qualification?.trim();
  if(!firstName||!lastName||!qualification)return Response.json({error:"Bitte Vorname, Nachname und Qualifikation angeben."},{status:400});
  if(firstName.length>80||lastName.length>80||qualification.length>100)return Response.json({error:"Eine Eingabe ist zu lang."},{status:400});
  const name=`${firstName} ${lastName}`;
  const db=getDb(),helperToken=crypto.randomUUID()+crypto.randomUUID(),helperId=id("hlp"),registeredAt=new Date(),sessionTokenHash=await tokenHash(helperToken);
  const inserted=await db.all(sql`INSERT INTO helpers (id,event_id,assignment_id,name,first_name,last_name,qualification,session_token_hash,registration_source,registered_at,removed_at)
    SELECT ${helperId},${event.id},NULL,${name},${firstName},${lastName},${qualification},${sessionTokenHash},'manual',${registeredAt.getTime()},NULL
    WHERE (SELECT COUNT(*) FROM helpers WHERE event_id=${event.id} AND removed_at IS NULL) < ${event.helperLimit}
    AND NOT EXISTS (SELECT 1 FROM helpers WHERE event_id=${event.id} AND removed_at IS NULL AND lower(trim(name))=lower(trim(${name}))) RETURNING id`);
  if(inserted.length!==1)return Response.json({error:"Die maximale Helferzahl ist erreicht oder diese Person bereits anwesend."},{status:409});
  return Response.json({ok:true,helperId,registeredAt:registeredAt.toISOString()},{status:201});
 }catch(error){console.error("helper_creation_failed",error);return Response.json({error:"Helfer konnte nicht angelegt werden."},{status:500})}
}
