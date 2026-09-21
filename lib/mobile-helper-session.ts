import {and,eq,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {events,helpers} from "@/db/schema";
import {tokenHash} from "@/lib/security";

export function bearerToken(request:Request){
 const authorization=request.headers.get("authorization")||"";
 const match=authorization.match(/^Bearer\s+([^\s]+)$/i);
 return match?.[1]||null;
}

export async function activeMobileHelper(request:Request,eventId:string){
 const raw=bearerToken(request);
 if(!raw||raw.length>200)return null;
 const [row]=await getDb().select({
  helperId:helpers.id,eventId:helpers.eventId,assignmentId:helpers.assignmentId,
  firstName:helpers.firstName,lastName:helpers.lastName,name:helpers.name,
  qualification:helpers.qualification,phone:helpers.phone,registeredAt:helpers.registeredAt,
  eventName:events.name,eventDate:events.eventDate,endDate:events.endDate,startTime:events.startTime,
  endTime:events.endTime,eventStatus:events.status
 }).from(helpers).innerJoin(events,eq(events.id,helpers.eventId)).where(and(
  eq(helpers.eventId,eventId),eq(helpers.sessionTokenHash,await tokenHash(raw)),
  isNull(helpers.removedAt),eq(events.status,"active")
 )).limit(1);
 return row||null;
}
