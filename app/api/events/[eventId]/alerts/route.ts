import {and,asc,eq,inArray,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {alertAssignments,alertRecipients,alerts,assignments,helpers} from "@/db/schema";
import {eventAuthenticated,ownedEvent} from "@/lib/event-access";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {dispatchAlertPush} from "@/lib/push-notifications";

async function alarmLog(eventId:string){
 const rows=await getDb().select({id:alerts.id,message:alerts.message,createdAt:alerts.createdAt,assignmentId:assignments.id,assignmentName:assignments.name}).from(alerts).innerJoin(alertAssignments,eq(alertAssignments.alertId,alerts.id)).innerJoin(assignments,eq(assignments.id,alertAssignments.assignmentId)).where(eq(alerts.eventId,eventId)).orderBy(asc(alerts.createdAt),asc(assignments.name));
 const grouped=new Map<string,{id:string;message:string|null;createdAt:Date;assignments:Array<{id:string;name:string}>}>();
 for(const row of rows){const entry=grouped.get(row.id)||{id:row.id,message:row.message,createdAt:row.createdAt,assignments:[]};entry.assignments.push({id:row.assignmentId,name:row.assignmentName});grouped.set(row.id,entry)}
 return [...grouped.values()];
}

export async function GET(_request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{const {eventId}=await params,authorization=await ownedEvent(eventId),{event,permissions}=authorization;if(!eventAuthenticated(authorization))return Response.json({error:"Bitte zuerst anmelden."},{status:401});if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});if(!permissions?.alarm)return Response.json({error:"Dieser Event-Zugang darf das Alarmprotokoll nicht öffnen."},{status:403});return Response.json({alerts:await alarmLog(event.id)},{headers:{"cache-control":"no-store"}})}catch(error){console.error("alert_log_failed",error);return Response.json({error:"Alarmprotokoll konnte nicht geladen werden."},{status:500})}
}

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 try{
  const {eventId}=await params,authorization=await ownedEvent(eventId),{user,event,access,permissions}=authorization;if(!eventAuthenticated(authorization))return Response.json({error:"Bitte zuerst anmelden."},{status:401});if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});if(!permissions?.alarm)return Response.json({error:"Dieser Event-Zugang darf nicht alarmieren."},{status:403});
  const principalLimit=await consumeRateLimit({scope:"event-alarm-principal",subject:`${event.id}:${access?.id||user?.id||"unknown"}`,limit:12,windowMs:60_000,blockMs:5*60_000});if(!principalLimit.allowed)return rateLimited(principalLimit.retryAfterSeconds);
  const networkLimit=await consumeRateLimit({scope:"event-alarm-network",subject:requestNetwork(request),limit:30,windowMs:60_000,blockMs:5*60_000});if(!networkLimit.allowed)return rateLimited(networkLimit.retryAfterSeconds);
  const body=await request.json() as {assignmentIds?:unknown;message?:unknown},assignmentIds=Array.isArray(body.assignmentIds)?[...new Set(body.assignmentIds.filter((value):value is string=>typeof value==="string"&&value.length>0))]:[],message=typeof body.message==="string"?body.message.trim():"";
  if(!assignmentIds.length||assignmentIds.length>50)return Response.json({error:"Bitte mindestens ein Sanitätsmittel auswählen."},{status:400});
  if(message.length>150)return Response.json({error:"Die Alarmmeldung darf höchstens 150 Zeichen enthalten."},{status:400});
  const db=getDb(),units=await db.select({id:assignments.id,name:assignments.name}).from(assignments).where(and(eq(assignments.eventId,event.id),isNull(assignments.removedAt),inArray(assignments.id,assignmentIds)));
  if(units.length!==assignmentIds.length)return Response.json({error:"Mindestens ein ausgewähltes Sanitätsmittel ist ungültig."},{status:400});
  const recipients=await db.select({id:helpers.id,assignmentId:helpers.assignmentId}).from(helpers).where(and(eq(helpers.eventId,event.id),eq(helpers.registrationSource,"qr"),isNull(helpers.removedAt),inArray(helpers.assignmentId,assignmentIds)));
  if(units.some(unit=>!recipients.some(recipient=>recipient.assignmentId===unit.id)))return Response.json({error:"Jedes Sanitätsmittel benötigt mindestens einen per QR-Code eingecheckten Helfer für eine Alarmierung."},{status:400});
  const alertId=id("alt"),now=new Date();
  await db.batch([
   db.insert(alerts).values({id:alertId,eventId:event.id,createdByUserId:user?.id||event.ownerUserId,createdByEventAccessId:access?.id||null,message:message||null,createdAt:now}),
   ...units.map(unit=>db.insert(alertAssignments).values({id:id("ala"),alertId,assignmentId:unit.id})),
   ...recipients.map(recipient=>db.insert(alertRecipients).values({id:id("alr"),alertId,helperId:recipient.id,sentAt:now})),
   ...units.map(unit=>db.update(assignments).set({operationalStatus:"deployed",deployedAt:now,clearedAt:null}).where(and(eq(assignments.id,unit.id),eq(assignments.eventId,event.id))))
  ]);
  let push={configured:false,attempted:0,sent:0};
  try{push=await dispatchAlertPush(alertId,event.id)}catch(error){console.error("alert_push_dispatch_failed",{alertId,error:error instanceof Error?error.message:"unknown"})}
  return Response.json({alert:{id:alertId,createdAt:now,message:message||null,assignments:units,recipientCount:recipients.length},push},{status:201});
 }catch(error){console.error("alert_create_failed",error);return Response.json({error:"Alarmierung konnte nicht protokolliert werden."},{status:500})}
}
