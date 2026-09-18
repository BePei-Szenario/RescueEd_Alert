import {and,asc,eq,inArray,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {alertAssignments,alertRecipients,alerts,assignments,helpers} from "@/db/schema";
import {ownedEvent} from "@/lib/event-access";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";

async function alarmLog(eventId:string){
 const rows=await getDb().select({id:alerts.id,message:alerts.message,createdAt:alerts.createdAt,assignmentId:assignments.id,assignmentName:assignments.name}).from(alerts).innerJoin(alertAssignments,eq(alertAssignments.alertId,alerts.id)).innerJoin(assignments,eq(assignments.id,alertAssignments.assignmentId)).where(eq(alerts.eventId,eventId)).orderBy(asc(alerts.createdAt),asc(assignments.name));
 const grouped=new Map<string,{id:string;message:string|null;createdAt:Date;assignments:Array<{id:string;name:string}>}>();
 for(const row of rows){const entry=grouped.get(row.id)||{id:row.id,message:row.message,createdAt:row.createdAt,assignments:[]};entry.assignments.push({id:row.assignmentId,name:row.assignmentName});grouped.set(row.id,entry)}
 return [...grouped.values()];
}

export async function GET(_request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{const {eventId}=await params,{user,event}=await ownedEvent(eventId);if(!user)return Response.json({error:"Bitte zuerst anmelden."},{status:401});if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});return Response.json({alerts:await alarmLog(event.id)},{headers:{"cache-control":"no-store"}})}catch(error){console.error("alert_log_failed",error);return Response.json({error:"Alarmprotokoll konnte nicht geladen werden."},{status:500})}
}

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 try{
  const {eventId}=await params,{user,event}=await ownedEvent(eventId);if(!user)return Response.json({error:"Bitte zuerst anmelden."},{status:401});if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});
  const body=await request.json() as {assignmentIds?:unknown;message?:unknown},assignmentIds=Array.isArray(body.assignmentIds)?[...new Set(body.assignmentIds.filter((value):value is string=>typeof value==="string"&&value.length>0))]:[],message=typeof body.message==="string"?body.message.trim():"";
  if(!assignmentIds.length||assignmentIds.length>50)return Response.json({error:"Bitte mindestens ein Sanitätsmittel auswählen."},{status:400});
  if(message.length>150)return Response.json({error:"Die Alarmmeldung darf höchstens 150 Zeichen enthalten."},{status:400});
  const db=getDb(),units=await db.select({id:assignments.id,name:assignments.name}).from(assignments).where(and(eq(assignments.eventId,event.id),isNull(assignments.removedAt),inArray(assignments.id,assignmentIds)));
  if(units.length!==assignmentIds.length)return Response.json({error:"Mindestens ein ausgewähltes Sanitätsmittel ist ungültig."},{status:400});
  const recipients=await db.select({id:helpers.id,assignmentId:helpers.assignmentId}).from(helpers).where(and(eq(helpers.eventId,event.id),eq(helpers.registrationSource,"qr"),isNull(helpers.removedAt),inArray(helpers.assignmentId,assignmentIds)));
  if(units.some(unit=>!recipients.some(recipient=>recipient.assignmentId===unit.id)))return Response.json({error:"Jedes Sanitätsmittel benötigt mindestens einen per QR-Code eingecheckten Helfer für eine Alarmierung."},{status:400});
  const alertId=id("alt"),now=new Date();
  await db.batch([
   db.insert(alerts).values({id:alertId,eventId:event.id,createdByUserId:user.id,message:message||null,createdAt:now}),
   ...units.map(unit=>db.insert(alertAssignments).values({id:id("ala"),alertId,assignmentId:unit.id})),
   ...recipients.map(recipient=>db.insert(alertRecipients).values({id:id("alr"),alertId,helperId:recipient.id,sentAt:now})),
   ...units.map(unit=>db.update(assignments).set({operationalStatus:"deployed",deployedAt:now,clearedAt:null}).where(and(eq(assignments.id,unit.id),eq(assignments.eventId,event.id))))
  ]);
  return Response.json({alert:{id:alertId,createdAt:now,message:message||null,assignments:units,recipientCount:recipients.length}},{status:201});
 }catch(error){console.error("alert_create_failed",error);return Response.json({error:"Alarmierung konnte nicht protokolliert werden."},{status:500})}
}
