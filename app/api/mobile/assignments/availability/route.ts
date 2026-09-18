import {and,eq,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {assignments,events,helpers} from "@/db/schema";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {tokenHash} from "@/lib/security";

export async function PATCH(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const limit=await consumeRateLimit({scope:"mobile-unit-availability",subject:requestNetwork(request),limit:60,windowMs:10*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const body=await request.json() as {eventId?:unknown;assignmentId?:unknown;helperToken?:unknown;status?:unknown};
  if(typeof body.eventId!=="string"||typeof body.assignmentId!=="string"||typeof body.helperToken!=="string"||body.status!=="available")return Response.json({error:"Freimeldung unvollständig."},{status:400});
  const db=getDb(),sessionTokenHash=await tokenHash(body.helperToken),[membership]=await db.select({assignmentId:assignments.id,eventStatus:events.status}).from(helpers).innerJoin(assignments,eq(assignments.id,helpers.assignmentId)).innerJoin(events,eq(events.id,helpers.eventId)).where(and(eq(helpers.eventId,body.eventId),eq(helpers.assignmentId,body.assignmentId),eq(helpers.registrationSource,"qr"),eq(helpers.sessionTokenHash,sessionTokenHash),isNull(helpers.removedAt),isNull(assignments.removedAt))).limit(1);
  if(!membership||membership.eventStatus!=="active")return Response.json({error:"Keine aktive Teamzuordnung für dieses Sanitätsmittel gefunden."},{status:403});
  const clearedAt=new Date();await db.update(assignments).set({operationalStatus:"available",clearedAt}).where(and(eq(assignments.id,membership.assignmentId),eq(assignments.eventId,body.eventId)));
  return Response.json({assignment:{id:membership.assignmentId,operationalStatus:"available",clearedAt}});
 }catch(error){console.error("mobile_assignment_availability_failed",error);return Response.json({error:"Sanitätsmittel konnte nicht freigemeldet werden."},{status:500})}
}
