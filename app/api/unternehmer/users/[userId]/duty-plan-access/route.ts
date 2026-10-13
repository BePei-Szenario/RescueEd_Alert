import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,organizations,users} from "@/db/schema";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";

export async function POST(request:Request,{params}:{params:Promise<{userId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
 try{
  const {userId}=await params,body=await request.json() as {enabled?:unknown};if(typeof body.enabled!=="boolean")return Response.json({error:"Ungültige Dienstplan-Freigabe."},{status:400});
  const db=getDb(),[target]=await db.select({id:users.id,role:users.role,accountType:users.accountType,status:users.status,organizationId:users.organizationId,dutyPlanEnabled:organizations.dutyPlanEnabled}).from(users).innerJoin(organizations,eq(organizations.id,users.organizationId)).where(eq(users.id,userId)).limit(1);
  if(!target||target.role!=="customer"||target.accountType!=="organization"||target.status==="deleted")return Response.json({error:"Organisationskonto nicht gefunden."},{status:404});
  const now=new Date();await db.batch([
   db.update(organizations).set({dutyPlanEnabled:body.enabled}).where(eq(organizations.id,target.organizationId)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:body.enabled?"customer.duty_plan_enabled":"customer.duty_plan_disabled",entityType:"organization",entityId:target.organizationId,metadataJson:JSON.stringify({customerUserId:userId,previous:target.dutyPlanEnabled,next:body.enabled}),createdAt:now})
  ]);
  return Response.json({ok:true,dutyPlanEnabled:body.enabled});
 }catch(error){console.error("duty_plan_access_update_failed",error);return Response.json({error:"Dienstplan-Freigabe konnte nicht geändert werden."},{status:500})}
}
