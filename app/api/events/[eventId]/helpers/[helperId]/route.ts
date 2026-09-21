import {and,eq,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {assignments,helperDevices,helpers} from "@/db/schema";
import {eventAuthenticated,ownedEvent} from "@/lib/event-access";
import {rejectCrossSiteMutation} from "@/lib/request-security";

export async function PATCH(request:Request,{params}:{params:Promise<{eventId:string;helperId:string}>}){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {eventId,helperId}=await params,authorization=await ownedEvent(eventId),{event,permissions}=authorization;
  if(!eventAuthenticated(authorization))return Response.json({error:"Bitte zuerst anmelden."},{status:401});
  if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});
  const {assignmentId,action}=await request.json() as {assignmentId?:string|null;action?:"checkout"},db=getDb();
  if(assignmentId){const [unit]=await db.select({id:assignments.id}).from(assignments).where(and(eq(assignments.id,assignmentId),eq(assignments.eventId,event.id),isNull(assignments.removedAt))).limit(1);if(!unit)return Response.json({error:"Sanitätsmittel nicht gefunden."},{status:400})}
  const [person]=await db.select({id:helpers.id,removedAt:helpers.removedAt,registrationSource:helpers.registrationSource}).from(helpers).where(and(eq(helpers.id,helperId),eq(helpers.eventId,event.id))).limit(1);
  if(!person)return Response.json({error:"Helfer nicht gefunden."},{status:404});
  if(action==="checkout"){
   if(!permissions?.manageHelpers)return Response.json({error:"Dieser Event-Zugang darf keine Helfer ausbuchen."},{status:403});
   if(person.removedAt)return Response.json({error:"Helfer wurde bereits ausgebucht."},{status:409});
   const leftAt=new Date();
   await db.batch([
    db.update(helpers).set({removedAt:leftAt}).where(eq(helpers.id,helperId)),
    db.delete(helperDevices).where(eq(helperDevices.helperId,helperId)),
   ]);
   return Response.json({ok:true,leftAt:leftAt.toISOString()});
  }
  if(!permissions?.assignHelpers)return Response.json({error:"Dieser Event-Zugang darf keine Einteilungen ändern."},{status:403});
  if(person.removedAt)return Response.json({error:"Ausgebuchte Helfer können nicht eingeteilt werden."},{status:409});
  if(assignmentId&&person.registrationSource==="manual")return Response.json({error:"Manuell angelegte Helfer ohne QR-Check-in können keinem Sanitätsmittel zugeteilt oder alarmiert werden."},{status:409});
  await db.update(helpers).set({assignmentId:assignmentId||null}).where(eq(helpers.id,helperId));
  return Response.json({ok:true});
 }catch(error){console.error("helper_assignment_failed",error);return Response.json({error:"Einteilung konnte nicht gespeichert werden."},{status:500})}
}
