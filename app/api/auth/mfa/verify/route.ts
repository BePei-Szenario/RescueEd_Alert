import {getDb} from "@/db";
import {securityTokens,sessions,users} from "@/db/schema";
import {and,eq,gt,isNull,lt,sql} from "drizzle-orm";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";
export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {challenge,code}=await request.json() as {challenge?:string;code?:string};
  if(!challenge||!/^\d{6}$/.test(code||"")||challenge.length>200)return Response.json({error:"Sicherheitscode fehlt oder ist ungültig."},{status:400});
  const networkLimit=await consumeRateLimit({scope:"mfa-verify-network",subject:requestNetwork(request),limit:30,windowMs:15*60_000});
  if(!networkLimit.allowed)return rateLimited(networkLimit.retryAfterSeconds);
  const db=getDb(),challengeHash=await tokenHash(challenge),now=new Date(),[token]=await db.select().from(securityTokens).where(and(eq(securityTokens.challengeHash,challengeHash),eq(securityTokens.purpose,"mfa"),isNull(securityTokens.usedAt))).limit(1);
  if(!token||token.expiresAt<=now||token.attempts>=5)return Response.json({error:"Sicherheitscode ungültig oder abgelaufen."},{status:401});
  const [user]=await db.select().from(users).where(eq(users.id,token.userId)).limit(1);
  if(!user||user.status!=="active"||(token.challengeArea==="unternehmer"&&user.role!=="platform_owner"&&user.role!=="platform_staff")||(token.challengeArea==="mobile_consumer"&&user.accountType!=="consumer")||(token.challengeArea==="customer"&&(user.accountType!=="organization"||(user.role!=="customer"&&user.role!=="organization_member"))))return Response.json({error:"Nicht autorisiert."},{status:401});
  const codeHash=await tokenHash(code!);
  if(token.tokenHash!==codeHash){
   await db.update(securityTokens).set({attempts:sql`${securityTokens.attempts} + 1`}).where(and(eq(securityTokens.id,token.id),isNull(securityTokens.usedAt),lt(securityTokens.attempts,5)));
   return Response.json({error:"Sicherheitscode ungültig oder abgelaufen."},{status:401});
  }
  const consumed=await db.update(securityTokens).set({usedAt:now}).where(and(eq(securityTokens.id,token.id),eq(securityTokens.tokenHash,codeHash),isNull(securityTokens.usedAt),lt(securityTokens.attempts,5),gt(securityTokens.expiresAt,now))).returning({id:securityTokens.id});
  if(consumed.length!==1)return Response.json({error:"Sicherheitscode ungültig oder abgelaufen."},{status:401});
  const raw=crypto.randomUUID()+crypto.randomUUID();await db.insert(sessions).values({id:id("ses"),userId:user.id,tokenHash:await tokenHash(raw),expiresAt:new Date(now.getTime()+8*3600000),createdAt:now});
  const secure=new URL(request.url).protocol==="https:"||process.env.NODE_ENV==="production"?"; Secure":"";
  return new Response(JSON.stringify({ok:true,userId:user.id,role:user.role,redirectTo:user.role==="platform_owner"||user.role==="platform_staff"?"/unternehmer":"/"}),{headers:{"content-type":"application/json","cache-control":"no-store","set-cookie":`rescueed_session=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`}});
 }catch(error){console.error("mfa_verify_failed",error);return Response.json({error:"Sicherheitscode konnte nicht geprüft werden."},{status:500})}
}
