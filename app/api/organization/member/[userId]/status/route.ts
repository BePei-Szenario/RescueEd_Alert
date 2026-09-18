import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,securityTokens,sessions,users} from "@/db/schema";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {currentUser} from "@/lib/session";

export async function POST(request:Request,{params}:{params:Promise<{userId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 const owner=await currentUser();if(!owner||owner.role!=="customer"||owner.accountType!=="organization")return Response.json({error:"Nicht autorisiert."},{status:403});
 try{
  const {userId}=await params,body=await request.json() as {status?:unknown};
  if(body.status!=="active"&&body.status!=="blocked")return Response.json({error:"Ungültiger Status."},{status:400});
  const db=getDb(),[member]=await db.select({status:users.status,emailVerifiedAt:users.emailVerifiedAt}).from(users).where(and(eq(users.id,userId),eq(users.organizationId,owner.organizationId),eq(users.role,"organization_member"))).limit(1);
  if(!member||member.status==="deleted")return Response.json({error:"Event-Benutzer nicht gefunden."},{status:404});
  if(body.status==="active"&&!member.emailVerifiedAt)return Response.json({error:"Zuerst muss der Einrichtungslink abgeschlossen werden."},{status:409});
  const now=new Date();await db.batch([
   db.update(users).set({status:body.status}).where(eq(users.id,userId)),
   db.delete(sessions).where(eq(sessions.userId,userId)),
   db.delete(securityTokens).where(eq(securityTokens.userId,userId)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:owner.id,action:body.status==="active"?"organization_member.enabled":"organization_member.blocked",entityType:"user",entityId:userId,createdAt:now})
  ]);
  return Response.json({ok:true,status:body.status});
 }catch(error){console.error("member_status_failed",error);return Response.json({error:"Event-Benutzerstatus konnte nicht geändert werden."},{status:500})}
}
