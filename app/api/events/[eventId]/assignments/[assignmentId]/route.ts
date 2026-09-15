import {and,eq,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {assignments,helpers} from "@/db/schema";
import {ownedEvent} from "@/lib/event-access";
import {rejectCrossSiteMutation} from "@/lib/request-security";

export async function PATCH(request:Request,{params}:{params:Promise<{eventId:string;assignmentId:string}>}){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {eventId,assignmentId}=await params,{user,event}=await ownedEvent(eventId);if(!user)return Response.json({error:"Bitte zuerst anmelden."},{status:401});if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});
  const body=await request.json() as {action?:unknown};if(body.action!=="clear")return Response.json({error:"Ungültige Statusänderung."},{status:400});
  const db=getDb(),[unit]=await db.select({id:assignments.id,operationalStatus:assignments.operationalStatus}).from(assignments).where(and(eq(assignments.id,assignmentId),eq(assignments.eventId,event.id),isNull(assignments.removedAt))).limit(1);if(!unit)return Response.json({error:"Sanitätsmittel nicht gefunden."},{status:404});
  const clearedAt=new Date();await db.update(assignments).set({operationalStatus:"available",clearedAt}).where(and(eq(assignments.id,unit.id),eq(assignments.eventId,event.id)));
  return Response.json({assignment:{id:unit.id,operationalStatus:"available",clearedAt}});
 }catch(error){console.error("assignment_clear_failed",error);return Response.json({error:"Sanitätsmittel konnte nicht freigemeldet werden."},{status:500})}
}

export async function DELETE(request:Request,{params}:{params:Promise<{eventId:string;assignmentId:string}>}){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {eventId,assignmentId}=await params,{user,event}=await ownedEvent(eventId);
  if(!user)return Response.json({error:"Bitte zuerst anmelden."},{status:401});
  if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});
  const db=getDb(),[unit]=await db.select({id:assignments.id}).from(assignments).where(and(eq(assignments.id,assignmentId),eq(assignments.eventId,event.id))).limit(1);
  if(!unit)return Response.json({error:"Sanitätsmittel nicht gefunden."},{status:404});
  const [assignedHelper]=await db.select({id:helpers.id}).from(helpers).where(and(eq(helpers.eventId,event.id),eq(helpers.assignmentId,assignmentId),isNull(helpers.removedAt))).limit(1);
  if(assignedHelper)return Response.json({error:"Das Sanitätsmittel kann erst gelöscht werden, wenn kein anwesender Helfer mehr eingeteilt ist."},{status:409});
  await db.update(assignments).set({removedAt:new Date()}).where(and(eq(assignments.id,assignmentId),eq(assignments.eventId,event.id)));
  return Response.json({ok:true});
 }catch(error){console.error("assignment_delete_failed",error);return Response.json({error:"Sanitätsmittel konnte nicht gelöscht werden."},{status:500})}
}
