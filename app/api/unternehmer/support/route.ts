import {desc,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {appCrashReports,supportTickets,users} from "@/db/schema";
import {requirePlatformStaffApi} from "@/lib/session";

export async function GET(){
 try{
  const auth=await requirePlatformStaffApi();if(auth.response)return auth.response;
  const db=getDb();
  const [tickets,crashes]=await Promise.all([
   db.select({id:supportTickets.id,subject:supportTickets.subject,status:supportTickets.status,requesterType:supportTickets.requesterType,requesterName:users.fullName,requesterEmail:users.email,eventId:supportTickets.eventId,createdAt:supportTickets.createdAt,updatedAt:supportTickets.updatedAt}).from(supportTickets).leftJoin(users,eq(supportTickets.requesterUserId,users.id)).orderBy(desc(supportTickets.updatedAt)).limit(100),
   db.select({id:appCrashReports.id,platform:appCrashReports.platform,appVersion:appCrashReports.appVersion,source:appCrashReports.source,errorKind:appCrashReports.errorKind,stackExcerpt:appCrashReports.stackExcerpt,fingerprint:appCrashReports.fingerprint,occurredAt:appCrashReports.occurredAt,createdAt:appCrashReports.createdAt}).from(appCrashReports).orderBy(desc(appCrashReports.createdAt)).limit(100)
  ]);
  return Response.json({tickets,crashes},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("owner_support_failed",error);return Response.json({error:"Supportdaten konnten nicht geladen werden."},{status:500})}
}
