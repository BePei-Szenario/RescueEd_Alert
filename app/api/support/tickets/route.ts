import {and,desc,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {supportMessages,supportTickets} from "@/db/schema";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {supportPrincipal} from "@/lib/support-access";

export async function GET(request:Request){
 try{
  const principal=await supportPrincipal(request,new URL(request.url).searchParams.get("eventId"));
  if(!principal)return Response.json({error:"Bitte zuerst anmelden oder einen aktiven Helferzugang verwenden."},{status:401});
  const where=principal.type==="user"?eq(supportTickets.requesterUserId,principal.id):and(eq(supportTickets.requesterType,"helper"),eq(supportTickets.requesterHelperId,principal.id));
  const tickets=await getDb().select({id:supportTickets.id,subject:supportTickets.subject,status:supportTickets.status,createdAt:supportTickets.createdAt,updatedAt:supportTickets.updatedAt}).from(supportTickets).where(where).orderBy(desc(supportTickets.updatedAt)).limit(50);
  return Response.json({tickets},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("support_list_failed",error);return Response.json({error:"Tickets konnten nicht geladen werden."},{status:500})}
}

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  if(Number(request.headers.get("content-length")||0)>7000)return Response.json({error:"Anfrage zu groß."},{status:413});
  const raw=await request.text();if(raw.length>7000)return Response.json({error:"Anfrage zu groß."},{status:413});
  const body=JSON.parse(raw) as {eventId?:unknown;subject?:unknown;message?:unknown};
  const principal=await supportPrincipal(request,typeof body.eventId==="string"?body.eventId:null);
  if(!principal)return Response.json({error:"Bitte zuerst anmelden oder einen aktiven Helferzugang verwenden."},{status:401});
  const subject=typeof body.subject==="string"?body.subject.trim():"",message=typeof body.message==="string"?body.message.trim():"";
  if(subject.length<5||subject.length>120||message.length<15||message.length>4000)return Response.json({error:"Betreff (5–120 Zeichen) und Beschreibung (15–4000 Zeichen) prüfen."},{status:400});
  const network=await consumeRateLimit({scope:"support-ticket-ip",subject:requestNetwork(request),limit:20,windowMs:86400000});if(!network.allowed)return rateLimited(network.retryAfterSeconds);
  const account=await consumeRateLimit({scope:"support-ticket-principal",subject:`${principal.type}:${principal.id}`,limit:5,windowMs:86400000});if(!account.allowed)return rateLimited(account.retryAfterSeconds);
  const db=getDb(),now=new Date(),ticketId=id("sup");
  await db.batch([
   db.insert(supportTickets).values({id:ticketId,requesterType:principal.type,requesterUserId:principal.type==="user"?principal.id:null,requesterHelperId:principal.type==="helper"?principal.id:null,eventId:principal.eventId,subject,status:"open",createdAt:now,updatedAt:now}),
   db.insert(supportMessages).values({id:id("msg"),ticketId,authorType:"requester",body:message,createdAt:now})
  ]);
  return Response.json({id:ticketId,status:"open"},{status:201,headers:{"cache-control":"no-store"}});
 }catch(error){if(error instanceof SyntaxError)return Response.json({error:"Ungültiges JSON."},{status:400});console.error("support_create_failed",error);return Response.json({error:"Ticket konnte nicht erstellt werden."},{status:500})}
}
