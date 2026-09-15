import {eq,sql} from "drizzle-orm";
import {getDb} from "@/db";
import {authRateLimits} from "@/db/schema";
import {tokenHash} from "@/lib/security";

type Limit={scope:string;subject:string;limit:number;windowMs:number;blockMs?:number};

export function requestNetwork(request:Request){
 return request.headers.get("cf-connecting-ip")?.trim()||"local-or-unknown";
}

export async function consumeRateLimit({scope,subject,limit,windowMs,blockMs=windowMs}:Limit){
 const db=getDb(),now=Date.now(),keyHash=await tokenHash(`${scope}:${subject}`),resetBefore=now-windowMs;
 const [row]=await db.insert(authRateLimits).values({keyHash,scope,attempts:1,windowStartedAt:now,updatedAt:now}).onConflictDoUpdate({
  target:authRateLimits.keyHash,
  set:{
   attempts:sql`CASE WHEN ${authRateLimits.windowStartedAt} <= ${resetBefore} THEN 1 ELSE ${authRateLimits.attempts} + 1 END`,
   windowStartedAt:sql`CASE WHEN ${authRateLimits.windowStartedAt} <= ${resetBefore} THEN ${now} ELSE ${authRateLimits.windowStartedAt} END`,
   blockedUntil:sql`CASE
     WHEN ${authRateLimits.blockedUntil} IS NOT NULL AND ${authRateLimits.blockedUntil} > ${now} THEN ${authRateLimits.blockedUntil}
     WHEN (CASE WHEN ${authRateLimits.windowStartedAt} <= ${resetBefore} THEN 1 ELSE ${authRateLimits.attempts} + 1 END) > ${limit} THEN ${now+blockMs}
     ELSE NULL END`,
   updatedAt:now
  }
 }).returning();
 await purgeExpiredRateLimits().catch(error=>console.error("rate_limit_cleanup_failed",error));
 const blockedUntil=row?.blockedUntil??null;
 if(blockedUntil&&blockedUntil>now)return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((blockedUntil-now)/1000))};
 return {allowed:true,retryAfterSeconds:0};
}

export async function clearRateLimit(scope:string,subject:string){
 const keyHash=await tokenHash(`${scope}:${subject}`);
 await getDb().delete(authRateLimits).where(eq(authRateLimits.keyHash,keyHash));
}

export async function purgeExpiredRateLimits(){
 const now=Date.now(),cutoff=now-48*60*60*1000;
 await getDb().run(sql`DELETE FROM auth_rate_limits WHERE key_hash IN (
  SELECT key_hash FROM auth_rate_limits
  WHERE updated_at < ${cutoff} AND (blocked_until IS NULL OR blocked_until < ${now})
  ORDER BY updated_at LIMIT 8
 )`);
}

export function rateLimited(retryAfterSeconds:number){
 return Response.json({error:"Zu viele Versuche. Bitte später erneut versuchen."},{status:429,headers:{"retry-after":String(retryAfterSeconds),"cache-control":"no-store"}});
}
