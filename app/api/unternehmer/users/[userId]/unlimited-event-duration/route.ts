import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,organizations,users} from "@/db/schema";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";

export async function POST(request:Request,{params}:{params:Promise<{userId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
 try{
  const {userId}=await params,body=await request.json() as {enabled?:unknown};
  if(typeof body.enabled!=="boolean")return Response.json({error:"Ungültige Dauernutzer-Freigabe."},{status:400});
  const db=getDb(),[target]=await db.select({id:users.id,role:users.role,accountType:users.accountType,status:users.status,organizationId:users.organizationId,unlimitedEventDuration:organizations.unlimitedEventDuration}).from(users).innerJoin(organizations,eq(users.organizationId,organizations.id)).where(eq(users.id,userId)).limit(1);
  if(!target||target.role!=="customer"||target.accountType!=="organization"||target.status==="deleted")return Response.json({error:"Organisationskonto nicht gefunden."},{status:404});
  const now=new Date();await db.batch([
   db.update(organizations).set({unlimitedEventDuration:body.enabled}).where(eq(organizations.id,target.organizationId)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:body.enabled?"customer.unlimited_duration_enabled":"customer.unlimited_duration_disabled",entityType:"organization",entityId:target.organizationId,metadataJson:JSON.stringify({customerUserId:userId,previous:target.unlimitedEventDuration,next:body.enabled}),createdAt:now})
  ]);
  return Response.json({ok:true,unlimitedEventDuration:body.enabled});
 }catch(error){console.error("unlimited_event_duration_update_failed",error);return Response.json({error:"Dauernutzer-Freigabe konnte nicht geändert werden."},{status:500})}
}
