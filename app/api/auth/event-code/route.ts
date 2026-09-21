import {and,eq,gt,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {eventAccessCodes,eventAccessSessions,events} from "@/db/schema";
import {permissionsForRole} from "@/lib/event-access";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const body=await request.json() as {code?:unknown},code=typeof body.code==="string"?body.code.trim().toUpperCase().replace(/[\s-]/g,""):"";
  if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code))return Response.json({error:"Der Event-Code ist ungültig."},{status:400});
  const network=requestNetwork(request),limit=await consumeRateLimit({scope:"event-code-network",subject:network,limit:20,windowMs:15*60_000});
  if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const now=new Date(),db=getDb(),codeHash=await tokenHash(code);
  const [access]=await db.select({id:eventAccessCodes.id,eventId:eventAccessCodes.eventId,role:eventAccessCodes.role,expiresAt:eventAccessCodes.expiresAt}).from(eventAccessCodes).innerJoin(events,eq(events.id,eventAccessCodes.eventId)).where(and(eq(eventAccessCodes.codeHash,codeHash),gt(eventAccessCodes.expiresAt,now),isNull(eventAccessCodes.revokedAt),eq(events.status,"active"))).limit(1);
  if(!access)return Response.json({error:"Event-Code ungültig oder abgelaufen."},{status:401});
  const raw=crypto.randomUUID()+crypto.randomUUID(),sessionExpiry=new Date(Math.min(access.expiresAt.getTime(),now.getTime()+8*60*60_000));
  await db.batch([db.insert(eventAccessSessions).values({id:id("eas"),accessCodeId:access.id,tokenHash:await tokenHash(raw),expiresAt:sessionExpiry,createdAt:now}),db.update(eventAccessCodes).set({lastUsedAt:now}).where(eq(eventAccessCodes.id,access.id))]);
  const secure=new URL(request.url).protocol==="https:"||process.env.NODE_ENV==="production"?"; Secure":"";
  const headers=new Headers({"content-type":"application/json","cache-control":"no-store"});
  headers.append("set-cookie",`rescueed_event_session=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1,Math.floor((sessionExpiry.getTime()-now.getTime())/1000))}${secure}`);
  headers.append("set-cookie",`rescueed_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
  return new Response(JSON.stringify({ok:true,eventId:access.eventId,role:access.role,permissions:permissionsForRole(access.role)}),{headers});
 }catch(error){console.error("event_code_login_failed",error);return Response.json({error:"Event-Zugang konnte nicht geöffnet werden."},{status:500})}
}
