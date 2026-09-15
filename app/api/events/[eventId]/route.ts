import {and,asc,eq,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {alertAssignments,alerts,assignments,emailOutbox,events,helpers,invoiceRequests,users} from "@/db/schema";
import {emailPayload} from "@/lib/email-signature";
import {senderFor} from "@/lib/email-settings";
import {ownedEvent} from "@/lib/event-access";
import {createEventSummaryPdf} from "@/lib/event-summary-pdf";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";

function base64(bytes:Uint8Array){let binary="";for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary)}

export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{
  const {eventId}=await params,{user,event}=await ownedEvent(eventId);
  if(!user)return Response.json({error:"Bitte zuerst anmelden."},{status:401});
  if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});
  const db=getDb();
  let checkInCode=event.checkInCode,checkOutCode=event.checkOutCode;
  if(!checkInCode||!checkOutCode){checkInCode=checkInCode||crypto.randomUUID().replaceAll("-","");checkOutCode=checkOutCode||crypto.randomUUID().replaceAll("-","");await db.update(events).set({checkInCode,checkOutCode}).where(eq(events.id,event.id))}
  const [invoice]=await db.select().from(invoiceRequests).where(eq(invoiceRequests.eventId,event.id)).limit(1);
  const units=await db.select().from(assignments).where(and(eq(assignments.eventId,event.id),isNull(assignments.removedAt))).orderBy(asc(assignments.name));
  const people=await db.select({id:helpers.id,name:helpers.name,firstName:helpers.firstName,lastName:helpers.lastName,qualification:helpers.qualification,assignmentId:helpers.assignmentId,assignmentName:assignments.name,registeredAt:helpers.registeredAt,removedAt:helpers.removedAt}).from(helpers).leftJoin(assignments,eq(helpers.assignmentId,assignments.id)).where(eq(helpers.eventId,event.id));
  people.sort((a,b)=>(a.lastName||a.name.split(/\s+/).at(-1)||a.name).localeCompare(b.lastName||b.name.split(/\s+/).at(-1)||b.name,"de",{sensitivity:"base"})||(a.firstName||a.name).localeCompare(b.firstName||b.name,"de",{sensitivity:"base"}));
  const origin=new URL(request.url).origin;
  return Response.json({event:{id:event.id,name:event.name,eventDate:event.eventDate,startTime:event.startTime,endTime:event.endTime,helperLimit:event.helperLimit,priceCents:event.priceCents,currency:event.currency,status:event.status,createdAt:event.createdAt},invoice:invoice?{id:invoice.id,recipientName:invoice.recipientName,street:invoice.street,postalCode:invoice.postalCode,city:invoice.city,email:invoice.email,amountCents:invoice.amountCents,status:invoice.status,createdAt:invoice.createdAt}:null,assignments:units,helpers:people,attendanceLinks:{come:`${origin}/event-attendance?eventId=${encodeURIComponent(event.id)}&mode=come&code=${encodeURIComponent(checkInCode)}`,leave:`${origin}/event-attendance?eventId=${encodeURIComponent(event.id)}&mode=leave&code=${encodeURIComponent(checkOutCode)}`}});
 }catch(error){console.error("event_detail_failed",error);return Response.json({error:"Eventdetails konnten nicht geladen werden."},{status:500})}
}

export async function DELETE(request:Request,{params}:{params:Promise<{eventId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 try{
  const {eventId}=await params,{user,event}=await ownedEvent(eventId);
  if(!user)return Response.json({error:"Bitte zuerst anmelden."},{status:401});
  if(!event)return Response.json({error:"Event nicht gefunden."},{status:404});
  const db=getDb(),[invoice]=await db.select().from(invoiceRequests).where(eq(invoiceRequests.eventId,event.id)).limit(1);
  const people=await db.select({name:helpers.name,firstName:helpers.firstName,lastName:helpers.lastName,qualification:helpers.qualification,registeredAt:helpers.registeredAt,removedAt:helpers.removedAt,assignmentName:assignments.name}).from(helpers).leftJoin(assignments,eq(helpers.assignmentId,assignments.id)).where(eq(helpers.eventId,event.id));
  people.sort((a,b)=>(a.lastName||a.name).localeCompare(b.lastName||b.name,"de",{sensitivity:"base"}));
  const alarmRows=await db.select({id:alerts.id,message:alerts.message,createdAt:alerts.createdAt,assignmentName:assignments.name}).from(alerts).innerJoin(alertAssignments,eq(alertAssignments.alertId,alerts.id)).innerJoin(assignments,eq(assignments.id,alertAssignments.assignmentId)).where(eq(alerts.eventId,event.id)).orderBy(asc(alerts.createdAt),asc(assignments.name));
  const alarmsForPdf=[...alarmRows.reduce((grouped,row)=>{const entry=grouped.get(row.id)||{message:row.message,createdAt:row.createdAt,assignmentNames:[] as string[]};entry.assignmentNames.push(row.assignmentName);grouped.set(row.id,entry);return grouped},new Map<string,{message:string|null;createdAt:Date;assignmentNames:string[]}>()).values()];
  const pdf=createEventSummaryPdf({event,invoice:invoice||null,helpers:people,alarms:alarmsForPdf,generatedAt:new Date()});
  const [creator]=await db.select({email:users.email}).from(users).where(eq(users.id,event.ownerUserId)).limit(1);
  const recipientEmail=creator?.email||user.email,filename=`rescueed-eventabschluss-${event.id}.pdf`,now=new Date();
  const senderEmail=await senderFor("customer_contact");
  await db.batch([
   db.insert(emailOutbox).values({id:id("mail"),userId:user.id,type:"event_deletion_summary",senderEmail,recipientEmail,subject:`RescueEd Alert - Abschlussdaten ${event.name}`,payloadJson:emailPayload({template:"event_deletion_summary",message:"Das Event wurde gelöscht. Anbei erhalten Sie die vollständigen Event- und Anwesenheitsdaten als PDF.",eventReference:event.id,attachment:{filename,contentType:"application/pdf",encoding:"base64",data:base64(pdf)}}),createdAt:now}),
   db.delete(events).where(eq(events.id,event.id))
  ]);
  return Response.json({ok:true,emailQueued:true,recipientEmail,filename,archiveBytes:pdf.length});
 }catch(error){console.error("event_delete_failed",error);return Response.json({error:"Event konnte nicht gelöscht und archiviert werden."},{status:500})}
}
