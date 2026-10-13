import {and,eq} from "drizzle-orm";
import {getDb,withImmediateTransaction} from "@/db";
import {dutyShifts,organizations} from "@/db/schema";
import {assertShiftWrite,cleanDutyText,dutyDate,DutyPlanConflict} from "@/lib/duty-plan";
import {eventAuthenticated,ownedEvent} from "@/lib/event-access";
import {rejectCrossSiteMutation} from "@/lib/request-security";

async function authorize(eventId:string){const authorization=await ownedEvent(eventId);if(!eventAuthenticated(authorization))return {error:Response.json({error:"Bitte zuerst anmelden."},{status:401})} as const;if(!authorization.event)return {error:Response.json({error:"Event nicht gefunden."},{status:404})} as const;if(!authorization.user||!authorization.permissions?.manageAssignments)return {error:Response.json({error:"Dieser Zugang darf den Dienstplan nicht verwalten."},{status:403})} as const;const [organization]=await getDb().select({enabled:organizations.dutyPlanEnabled}).from(organizations).where(eq(organizations.id,authorization.event.organizationId)).limit(1);if(!organization?.enabled)return {error:Response.json({error:"Das Dienstplan-Modul ist nicht freigeschaltet."},{status:403})} as const;return {authorization} as const}

export async function PATCH(request:Request,{params}:{params:Promise<{eventId:string;shiftId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 try{
  const {eventId,shiftId}=await params,auth=await authorize(eventId);if("error" in auth)return auth.error;const event=auth.authorization.event!,body=await request.json() as Record<string,unknown>;
  const [current]=await getDb().select().from(dutyShifts).where(and(eq(dutyShifts.id,shiftId),eq(dutyShifts.eventId,event.id))).limit(1);if(!current)return Response.json({error:"Dienst nicht gefunden."},{status:404});
  const title=body.title===undefined?current.title:cleanDutyText(body.title,120),assignmentId=body.assignmentId===undefined?current.assignmentId:cleanDutyText(body.assignmentId,100),startAt=body.startAt===undefined?current.startAt:dutyDate(body.startAt),endAt=body.endAt===undefined?current.endAt:dutyDate(body.endAt),capacity=body.capacity===undefined?current.capacity:Number(body.capacity),reserved=body.reserved===undefined?current.reserved:body.reserved===true;
  if(!title||!assignmentId||!startAt||!endAt||!Number.isInteger(capacity))return Response.json({error:"Ungültige Dienstdaten."},{status:400});
  withImmediateTransaction(connection=>{
   assertShiftWrite(connection,{eventId:event.id,shiftId,assignmentId,startAt:startAt.getTime(),endAt:endAt.getTime(),capacity,reserved});
   const conflicts=connection.prepare("SELECT b.id FROM duty_bookings b WHERE b.shift_id=? AND EXISTS (SELECT 1 FROM duty_bookings other JOIN duty_shifts os ON os.id=other.shift_id WHERE other.email_hash=b.email_hash AND other.id<>b.id AND os.event_id=? AND os.start_at<? AND os.end_at>?) LIMIT 1").get(shiftId,event.id,endAt.getTime(),startAt.getTime());
   if(conflicts)throw new DutyPlanConflict("Die neue Dienstzeit überschneidet sich mit einem weiteren Dienst einer eingetragenen Person.");
   connection.prepare("UPDATE duty_shifts SET assignment_id=?,title=?,start_at=?,end_at=?,capacity=?,reserved=? WHERE id=? AND event_id=?").run(assignmentId,title,startAt.getTime(),endAt.getTime(),capacity,reserved?1:0,shiftId,event.id);
  });
  return Response.json({ok:true,shift:{id:shiftId,title,assignmentId,startAt,endAt,capacity,reserved}});
 }catch(error){if(error instanceof DutyPlanConflict)return Response.json({error:error.message},{status:409});console.error("duty_shift_update_failed",error);return Response.json({error:"Dienst konnte nicht geändert werden."},{status:500})}
}

export async function DELETE(request:Request,{params}:{params:Promise<{eventId:string;shiftId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 try{const {eventId,shiftId}=await params,auth=await authorize(eventId);if("error" in auth)return auth.error;const deleted=withImmediateTransaction(connection=>{const count=Number((connection.prepare("SELECT COUNT(*) AS count FROM duty_bookings WHERE shift_id=?").get(shiftId) as {count:number}).count);if(count)throw new DutyPlanConflict("Bitte zuerst die Dienstbesetzungen löschen, damit die Betroffenen eine Stornierungs-E-Mail erhalten.");return connection.prepare("DELETE FROM duty_shifts WHERE id=? AND event_id=?").run(shiftId,eventId).changes});if(!deleted)return Response.json({error:"Dienst nicht gefunden."},{status:404});return Response.json({ok:true})}catch(error){if(error instanceof DutyPlanConflict)return Response.json({error:error.message},{status:409});console.error("duty_shift_delete_failed",error);return Response.json({error:"Dienst konnte nicht gelöscht werden."},{status:500})}
}
