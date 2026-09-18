import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,securityTokens,sessions,users} from "@/db/schema";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";

export async function POST(request:Request,{params}:{params:Promise<{userId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
 try{
  const {userId}=await params,body=await request.json() as {status?:unknown};
  if(body.status!=="active"&&body.status!=="blocked")return Response.json({error:"Ungültiger Status."},{status:400});
  const db=getDb(),[target]=await db.select({role:users.role,status:users.status,emailVerifiedAt:users.emailVerifiedAt}).from(users).where(eq(users.id,userId)).limit(1);
  if(!target||target.role!=="platform_staff"||target.status==="deleted")return Response.json({error:"Mitarbeiterkonto nicht gefunden."},{status:404});
  if(body.status==="active"&&!target.emailVerifiedAt)return Response.json({error:"Zuerst muss der Einrichtungslink abgeschlossen werden."},{status:409});
  const now=new Date();await db.batch([
   db.update(users).set({status:body.status}).where(eq(users.id,userId)),
   db.delete(sessions).where(eq(sessions.userId,userId)),
   db.delete(securityTokens).where(eq(securityTokens.userId,userId)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:body.status==="active"?"platform_staff.enabled":"platform_staff.blocked",entityType:"user",entityId:userId,createdAt:now})
  ]);
  return Response.json({ok:true,status:body.status});
 }catch(error){console.error("platform_staff_status_failed",error);return Response.json({error:"Mitarbeiterstatus konnte nicht geändert werden."},{status:500})}
}
