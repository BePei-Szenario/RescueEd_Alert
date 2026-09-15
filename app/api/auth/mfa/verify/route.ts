import {getDb} from "@/db";
import {securityTokens,sessions,users} from "@/db/schema";
import {and,desc,eq,isNull} from "drizzle-orm";
import {id,tokenHash} from "@/lib/security";
export async function POST(request:Request){
 try{
  const {userId,code,area}=await request.json() as {userId?:string;code?:string;area?:string};if(!userId||!code)return Response.json({error:"Code fehlt."},{status:400});
  const db=getDb(),[token]=await db.select().from(securityTokens).where(and(eq(securityTokens.userId,userId),eq(securityTokens.purpose,"mfa"),isNull(securityTokens.usedAt))).orderBy(desc(securityTokens.createdAt)).limit(1);
  const [user]=await db.select().from(users).where(eq(users.id,userId)).limit(1);if(!user||user.status!=="active"||(area==="unternehmer"&&user.role!=="platform_owner"))return Response.json({error:"Nicht autorisiert."},{status:401});
  const now=new Date();if(!token||token.expiresAt<now||token.attempts>=5||token.tokenHash!==await tokenHash(code)){if(token)await db.update(securityTokens).set({attempts:token.attempts+1}).where(eq(securityTokens.id,token.id));return Response.json({error:"Code ungültig oder abgelaufen."},{status:401})}
  const raw=crypto.randomUUID()+crypto.randomUUID();await db.batch([db.update(securityTokens).set({usedAt:now}).where(eq(securityTokens.id,token.id)),db.insert(sessions).values({id:id("ses"),userId,tokenHash:await tokenHash(raw),expiresAt:new Date(now.getTime()+8*3600000),createdAt:now})]);
  const secure=process.env.NODE_ENV==="production"?"; Secure":"";
  return new Response(JSON.stringify({ok:true,userId,role:user.role,redirectTo:user.role==="platform_owner"?"/unternehmer":"/"}),{headers:{"content-type":"application/json","cache-control":"no-store","set-cookie":`rescueed_session=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`}});
 }catch(error){console.error("mfa_verify_failed",error);return Response.json({error:"Sicherheitscode konnte nicht geprüft werden."},{status:500})}
}
