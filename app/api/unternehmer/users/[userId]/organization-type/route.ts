import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,organizations,users} from "@/db/schema";
import {isOrganizationType} from "@/lib/organization-type";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";

export async function POST(request:Request,{params}:{params:Promise<{userId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
 try{
  const {userId}=await params,body=await request.json() as {organizationType?:unknown};
  if(!isOrganizationType(body.organizationType))return Response.json({error:"Ungültige Organisationsart."},{status:400});
  const db=getDb(),[target]=await db.select({id:users.id,role:users.role,accountType:users.accountType,status:users.status,organizationId:users.organizationId,organizationType:organizations.organizationType}).from(users).innerJoin(organizations,eq(users.organizationId,organizations.id)).where(eq(users.id,userId)).limit(1);
  if(!target||target.role!=="customer"||target.accountType!=="organization"||target.status==="deleted")return Response.json({error:"Organisationskonto nicht gefunden."},{status:404});
  const now=new Date();await db.batch([
   db.update(organizations).set({organizationType:body.organizationType}).where(eq(organizations.id,target.organizationId)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:"customer.organization_type_updated",entityType:"organization",entityId:target.organizationId,metadataJson:JSON.stringify({customerUserId:userId,previous:target.organizationType,next:body.organizationType}),createdAt:now})
  ]);
  return Response.json({ok:true,organizationType:body.organizationType});
 }catch(error){console.error("organization_type_update_failed",error);return Response.json({error:"Organisationsart konnte nicht geändert werden."},{status:500})}
}
