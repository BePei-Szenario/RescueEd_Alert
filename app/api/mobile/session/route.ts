import {and,desc,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {alertAssignments,alertRecipients,alerts,assignments} from "@/db/schema";
import {activeMobileHelper} from "@/lib/mobile-helper-session";
import {effectiveEventEndDate} from "@/lib/event-duration";

export async function GET(request:Request){
 try{
  const eventId=new URL(request.url).searchParams.get("eventId")||"";
  if(!eventId)return Response.json({error:"Event-ID fehlt."},{status:400});
  const helper=await activeMobileHelper(request,eventId);
  if(!helper)return Response.json({error:"Der temporäre Zugang ist ungültig oder beendet."},{status:401});
  const db=getDb();
  const [assignment]=helper.assignmentId?await db.select({id:assignments.id,name:assignments.name,operationalStatus:assignments.operationalStatus,deployedAt:assignments.deployedAt,clearedAt:assignments.clearedAt}).from(assignments).where(eq(assignments.id,helper.assignmentId)).limit(1):[];
  const alarmRows=await db.select({
   id:alerts.id,message:alerts.message,createdAt:alerts.createdAt,
   acknowledgedAt:alertRecipients.acknowledgedAt,assignmentId:alertAssignments.assignmentId
  }).from(alertRecipients)
   .innerJoin(alerts,eq(alerts.id,alertRecipients.alertId))
   .innerJoin(alertAssignments,and(eq(alertAssignments.alertId,alerts.id),eq(alertAssignments.assignmentId,helper.assignmentId||"")))
   .where(and(eq(alertRecipients.helperId,helper.helperId),eq(alerts.eventId,eventId)))
   .orderBy(desc(alerts.createdAt)).limit(50);
  return Response.json({
   event:{id:helper.eventId,name:helper.eventName,eventDate:helper.eventDate,endDate:effectiveEventEndDate(helper.eventDate,helper.startTime,helper.endDate,helper.endTime),startTime:helper.startTime,endTime:helper.endTime,status:helper.eventStatus},
   helper:{id:helper.helperId,name:helper.name,firstName:helper.firstName,lastName:helper.lastName,qualification:helper.qualification,phone:helper.phone,registeredAt:helper.registeredAt},
   assignment:assignment||null,
   alerts:alarmRows.map(row=>({id:row.id,message:row.message,createdAt:row.createdAt,acknowledgedAt:row.acknowledgedAt}))
  },{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("mobile_session_failed",error);return Response.json({error:"Mobiler Zugang konnte nicht geladen werden."},{status:500})}
}
