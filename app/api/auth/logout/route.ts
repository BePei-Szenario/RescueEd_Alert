import {cookies} from "next/headers";
import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {eventAccessSessions,sessions} from "@/db/schema";
import {tokenHash} from "@/lib/security";
import {rejectCrossSiteMutation} from "@/lib/request-security";
export async function POST(request:Request){const bad=rejectCrossSiteMutation(request);if(bad)return bad;const jar=await cookies(),raw=jar.get("rescueed_session")?.value,eventRaw=jar.get("rescueed_event_session")?.value,db=getDb();if(raw)await db.delete(sessions).where(eq(sessions.tokenHash,await tokenHash(raw)));if(eventRaw)await db.delete(eventAccessSessions).where(eq(eventAccessSessions.tokenHash,await tokenHash(eventRaw)));const headers=new Headers({"content-type":"application/json"});headers.append("set-cookie","rescueed_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");headers.append("set-cookie","rescueed_event_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");return new Response(JSON.stringify({ok:true}),{headers})}
