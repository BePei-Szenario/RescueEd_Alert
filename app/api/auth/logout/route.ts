import {cookies} from "next/headers";
import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {sessions} from "@/db/schema";
import {tokenHash} from "@/lib/security";
import {rejectCrossSiteMutation} from "@/lib/request-security";
export async function POST(request:Request){const bad=rejectCrossSiteMutation(request);if(bad)return bad;const raw=(await cookies()).get("rescueed_session")?.value;if(raw)await getDb().delete(sessions).where(eq(sessions.tokenHash,await tokenHash(raw)));return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","set-cookie":"rescueed_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"}})}
