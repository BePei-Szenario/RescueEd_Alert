import {asc,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {supportMessages,supportTickets} from "@/db/schema";
import {consumeRateLimit,rateLimited} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {platformStaff} from "@/lib/session";
import {supportPrincipal} from "@/lib/support-access";

async function access(request:Request,ticketId:string,eventId?:string|null){
 const db=getDb(),[ticket]=await db.select().from(supportTickets).where(eq(supportTickets.id,ticketId)).limit(1);
 if(!ticket)return {ticket:null,owner:false};
 const owner=await platformStaff();if(owner)return {ticket,owner:true};
 const principal=await supportPrincipal(request,eventId);
 if(principal&&((principal.type==="user"&&ticket.requesterType==="user"&&ticket.requesterUserId===principal.id)||(principal.type==="helper"&&ticket.requesterType==="helper"&&ticket.requesterHelperId===principal.id&&ticket.eventId===principal.eventId)))return {ticket,owner:false};
 return {ticket:null,owner:false};
}

export async function GET(request:Request,{params}:{params:Promise<{ticketId:string}>}){
 try{
  const {ticketId}=await params,{ticket,owner}=await access(request,ticketId,new URL(request.url).searchParams.get("eventId"));
  if(!ticket)return Response.json({error:"Ticket nicht gefunden."},{status:404});
  const messages=await getDb().select({id:supportMessages.id,authorType:supportMessages.authorType,body:supportMessages.body,createdAt:supportMessages.createdAt}).from(supportMessages).where(eq(supportMessages.ticketId,ticketId)).orderBy(asc(supportMessages.createdAt)).limit(100);
  return Response.json({ticket:{id:ticket.id,subject:ticket.subject,status:ticket.status,createdAt:ticket.createdAt,updatedAt:ticket.updatedAt,...(owner?{requesterType:ticket.requesterType,requesterUserId:ticket.requesterUserId,eventId:ticket.eventId}:{})},messages},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("support_detail_failed",error);return Response.json({error:"Ticket konnte nicht geladen werden."},{status:500})}
}

export async function POST(request:Request,{params}:{params:Promise<{ticketId:string}>}){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {ticketId}=await params;
  if(Number(request.headers.get("content-length")||0)>5000)return Response.json({error:"Anfrage zu groß."},{status:413});
  const raw=await request.text();if(raw.length>5000)return Response.json({error:"Anfrage zu groß."},{status:413});
  const body=JSON.parse(raw) as {eventId?:unknown;message?:unknown};
  const {ticket,owner}=await access(request,ticketId,typeof body.eventId==="string"?body.eventId:null);
  if(!ticket)return Response.json({error:"Ticket nicht gefunden."},{status:404});
  if(!owner&&ticket.status==="resolved")return Response.json({error:"Dieses Ticket ist abgeschlossen."},{status:409});
  const message=typeof body.message==="string"?body.message.trim():"";
  if(message.length<2||message.length>4000)return Response.json({error:"Nachricht muss 2–4000 Zeichen enthalten."},{status:400});
  const limit=await consumeRateLimit({scope:"support-reply",subject:`${owner?"owner":ticket.requesterType}:${ticketId}`,limit:30,windowMs:3600000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const db=getDb(),now=new Date();await db.batch([db.insert(supportMessages).values({id:id("msg"),ticketId,authorType:owner?"support":"requester",body:message,createdAt:now}),db.update(supportTickets).set({updatedAt:now,status:owner?"in_progress":ticket.status,resolvedAt:owner?null:ticket.resolvedAt}).where(eq(supportTickets.id,ticketId))]);
  return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
 }catch(error){if(error instanceof SyntaxError)return Response.json({error:"Ungültiges JSON."},{status:400});console.error("support_reply_failed",error);return Response.json({error:"Antwort konnte nicht gespeichert werden."},{status:500})}
}

export async function PATCH(request:Request,{params}:{params:Promise<{ticketId:string}>}){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const owner=await platformStaff();if(!owner)return Response.json({error:"Nicht autorisiert."},{status:401});
  if(Number(request.headers.get("content-length")||0)>1000)return Response.json({error:"Anfrage zu groß."},{status:413});
  const raw=await request.text();if(raw.length>1000)return Response.json({error:"Anfrage zu groß."},{status:413});
  const {ticketId}=await params,body=JSON.parse(raw) as {status?:unknown};
  if(!["open","in_progress","resolved"].includes(String(body.status)))return Response.json({error:"Ungültiger Status."},{status:400});
  const now=new Date(),updated=await getDb().update(supportTickets).set({status:body.status as "open"|"in_progress"|"resolved",resolvedAt:body.status==="resolved"?now:null,updatedAt:now}).where(eq(supportTickets.id,ticketId)).returning({id:supportTickets.id});
  if(!updated.length)return Response.json({error:"Ticket nicht gefunden."},{status:404});
  return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
 }catch(error){if(error instanceof SyntaxError)return Response.json({error:"Ungültiges JSON."},{status:400});console.error("support_status_failed",error);return Response.json({error:"Status konnte nicht geändert werden."},{status:500})}
}
