import {getDb} from "@/db";
import {assignments} from "@/db/schema";
import {ownedEvent} from "@/lib/event-access";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {eventId}=await params,{user,event}=await ownedEvent(eventId);
  if(!user)return Response.json({error:"Bitte zuerst anmelden."},{status:401});
  if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});
  const {name}=await request.json() as {name?:string},clean=name?.trim();
  if(!clean||clean.length>80)return Response.json({error:"Bitte eine Bezeichnung mit höchstens 80 Zeichen angeben."},{status:400});
  const assignment={id:id("asn"),eventId:event.id,name:clean,createdAt:new Date()};
  await getDb().insert(assignments).values(assignment);
  return Response.json({assignment},{status:201});
 }catch(error){console.error("assignment_create_failed",error);return Response.json({error:"Dieses Sanitätsmittel besteht bereits oder konnte nicht angelegt werden."},{status:409})}
}
