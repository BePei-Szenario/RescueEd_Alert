import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,sessions,users} from "@/db/schema";
import {consumeRateLimit,rateLimited} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {hashSecret,id,verifySecret} from "@/lib/security";
import {currentUser} from "@/lib/session";

export async function POST(request:Request){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 const account=await currentUser();if(!account)return Response.json({error:"Bitte zuerst anmelden."},{status:401});
 try{
  const body=await request.json() as {currentPassword?:unknown;newPassword?:unknown};
  if(typeof body.currentPassword!=="string"||typeof body.newPassword!=="string"||body.newPassword.length<12||body.newPassword.length>1024||body.currentPassword.length>1024||body.currentPassword===body.newPassword)return Response.json({error:"Bitte ein neues Passwort mit mindestens 12 Zeichen verwenden."},{status:400});
  const limit=await consumeRateLimit({scope:"profile-password",subject:account.id,limit:5,windowMs:15*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const db=getDb(),[user]=await db.select({passwordHash:users.passwordHash}).from(users).where(eq(users.id,account.id)).limit(1);
  if(!user||!await verifySecret(body.currentPassword,user.passwordHash))return Response.json({error:"Das bisherige Passwort ist nicht korrekt."},{status:401});
  const now=new Date();await db.batch([
   db.update(users).set({passwordHash:await hashSecret(body.newPassword)}).where(eq(users.id,account.id)),
   db.delete(sessions).where(eq(sessions.userId,account.id)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:account.id,action:"password.changed",entityType:"user",entityId:account.id,createdAt:now})
  ]);
  return Response.json({ok:true},{headers:{"cache-control":"no-store","set-cookie":"rescueed_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"}});
 }catch(error){console.error("profile_password_failed",error);return Response.json({error:"Passwort konnte nicht geändert werden."},{status:500})}
}
