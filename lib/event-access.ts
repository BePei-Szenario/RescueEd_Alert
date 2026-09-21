import {cookies} from "next/headers";
import {and,eq,gt,isNotNull,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {eventAccessCodes,eventAccessSessions,eventAdministrators,events} from "@/db/schema";
import {currentUser} from "@/lib/session";
import {tokenHash} from "@/lib/security";

export type EventAccessRole="helper_recorder"|"alarm_operator"|"event_manager";
export type EventPermissions={viewHelpers:boolean;manageHelpers:boolean;viewOperations:boolean;assignHelpers:boolean;manageAssignments:boolean;alarm:boolean;viewDetails:boolean;viewQr:boolean;exportHelpers:boolean;deleteEvent:boolean};

const fullPermissions:EventPermissions={viewHelpers:true,manageHelpers:true,viewOperations:true,assignHelpers:true,manageAssignments:true,alarm:true,viewDetails:true,viewQr:true,exportHelpers:true,deleteEvent:true};

export function permissionsForRole(role:EventAccessRole):EventPermissions{
 if(role==="helper_recorder")return {viewHelpers:true,manageHelpers:true,viewOperations:false,assignHelpers:false,manageAssignments:false,alarm:false,viewDetails:false,viewQr:false,exportHelpers:false,deleteEvent:false};
 if(role==="alarm_operator")return {viewHelpers:false,manageHelpers:false,viewOperations:true,assignHelpers:true,manageAssignments:false,alarm:true,viewDetails:false,viewQr:false,exportHelpers:false,deleteEvent:false};
 return {viewHelpers:true,manageHelpers:true,viewOperations:true,assignHelpers:true,manageAssignments:true,alarm:true,viewDetails:false,viewQr:false,exportHelpers:true,deleteEvent:false};
}

export async function currentEventAccess(){
 const raw=(await cookies()).get("rescueed_event_session")?.value;
 if(!raw)return null;
 const now=new Date(),db=getDb();
 const [access]=await db.select({sessionId:eventAccessSessions.id,id:eventAccessCodes.id,eventId:eventAccessCodes.eventId,role:eventAccessCodes.role,expiresAt:eventAccessSessions.expiresAt}).from(eventAccessSessions).innerJoin(eventAccessCodes,eq(eventAccessSessions.accessCodeId,eventAccessCodes.id)).innerJoin(events,eq(events.id,eventAccessCodes.eventId)).where(and(eq(eventAccessSessions.tokenHash,await tokenHash(raw)),gt(eventAccessSessions.expiresAt,now),gt(eventAccessCodes.expiresAt,now),isNull(eventAccessCodes.revokedAt),eq(events.status,"active"))).limit(1);
 return access||null;
}

export async function ownedEvent(eventId:string){
 const user=await currentUser(),db=getDb();
 if(user){
  const [event]=await db.select().from(events).where(and(eq(events.id,eventId),eq(events.organizationId,user.organizationId))).limit(1);
  if(!event)return {user,event:null,access:null,permissions:null};
  if(user.accountType==="organization"&&(user.role==="customer"||user.role==="organization_member"))return {user,event,access:null,permissions:fullPermissions};
  if(event.ownerUserId===user.id)return {user,event,access:null,permissions:fullPermissions};
  const [membership]=await db.select({id:eventAdministrators.id}).from(eventAdministrators).where(and(eq(eventAdministrators.eventId,event.id),eq(eventAdministrators.userId,user.id),eq(eventAdministrators.role,"owner"),isNotNull(eventAdministrators.acceptedAt))).limit(1);
  return {user,event:membership?event:null,access:null,permissions:membership?fullPermissions:null};
 }
 const access=await currentEventAccess();
 if(!access||access.eventId!==eventId)return {user:null,event:null,access:null,permissions:null};
 const [event]=await db.select().from(events).where(eq(events.id,eventId)).limit(1);
 return {user:null,event:event||null,access,permissions:event?permissionsForRole(access.role):null};
}

export function eventAuthenticated(result:Awaited<ReturnType<typeof ownedEvent>>){return Boolean(result.user||result.access)}
