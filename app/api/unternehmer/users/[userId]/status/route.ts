import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,sessions,users} from "@/db/schema";
import {id} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";
import {rejectCrossSiteMutation} from "@/lib/request-security";
export async function POST(request:Request,{params}:{params:Promise<{userId:string}>}){const bad=rejectCrossSiteMutation(request);if(bad)return bad;const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;const {userId}=await params,{status}=await request.json() as {status?:"active"|"blocked"};if(!["active","blocked"].includes(status||""))return Response.json({error:"Ungültiger Status."},{status:400});const db=getDb(),[target]=await db.select().from(users).where(eq(users.id,userId)).limit(1);if(!target||target.role==="platform_owner"||target.status==="deleted")return Response.json({error:"Konto kann nicht geändert werden."},{status:400});await db.batch([db.update(users).set({status}).where(eq(users.id,userId)),db.delete(sessions).where(eq(sessions.userId,userId)),db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:`user.${status}`,entityType:"user",entityId:userId,createdAt:new Date()})]);return Response.json({ok:true})}
