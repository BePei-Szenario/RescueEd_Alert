import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,invoiceRequests} from "@/db/schema";
import {id} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";
import {rejectCrossSiteMutation} from "@/lib/request-security";
export async function POST(request:Request,{params}:{params:Promise<{invoiceId:string}>}){const bad=rejectCrossSiteMutation(request);if(bad)return bad;const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;const {invoiceId}=await params,{status}=await request.json() as {status?:"pending"|"sent"|"paid"|"cancelled"};if(!["pending","sent","paid","cancelled"].includes(status||""))return Response.json({error:"Ungültiger Status."},{status:400});const db=getDb();await db.batch([db.update(invoiceRequests).set({status,transmittedAt:status==="sent"?new Date():undefined}).where(eq(invoiceRequests.id,invoiceId)),db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:`invoice.${status}`,entityType:"invoice",entityId:invoiceId,createdAt:new Date()})]);return Response.json({ok:true})}
