import {eq,sql} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,legalAcknowledgements,organizations,pendingConsumerRegistrations,users} from "@/db/schema";
import {currentConsumerDocuments,consumerEvidence,type ConsumerLegalEvidence} from "@/lib/consumer-legal";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const body=await request.json() as {email?:string;code?:string};
  const email=body.email?.trim().toLowerCase()||"",code=body.code||"";
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^\d{6}$/.test(code))return Response.json({error:"Sicherheitscode ungültig oder abgelaufen."},{status:400});
  const limit=await consumeRateLimit({scope:"consumer-verify-network",subject:requestNetwork(request),limit:20,windowMs:15*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const db=getDb(),[pending]=await db.select().from(pendingConsumerRegistrations).where(eq(pendingConsumerRegistrations.email,email)).limit(1),now=new Date();
  if(!pending||pending.expiresAt<=now||pending.attempts>=5)return Response.json({error:"Sicherheitscode ungültig oder abgelaufen."},{status:401});
  if(pending.codeHash!==await tokenHash(code)){
   await db.update(pendingConsumerRegistrations).set({attempts:sql`${pendingConsumerRegistrations.attempts} + 1`}).where(eq(pendingConsumerRegistrations.id,pending.id));
   return Response.json({error:"Sicherheitscode ungültig oder abgelaufen."},{status:401});
  }
  const documents=await currentConsumerDocuments(),expected=documents?consumerEvidence(documents):null;
  let accepted:ConsumerLegalEvidence[]=[];try{accepted=JSON.parse(pending.legalEvidenceJson) as ConsumerLegalEvidence[]}catch{}
  if(!expected||expected.length!==accepted.length||expected.some(row=>!accepted.some(given=>given.documentVersionId===row.documentVersionId&&given.documentHash===row.documentHash&&given.acknowledgementType===row.acknowledgementType)))return Response.json({error:"Die Rechtstexte wurden geändert. Bitte die Registrierung erneut beginnen."},{status:409});
  const [existing]=await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1);if(existing)return Response.json({error:"Für diese E-Mail-Adresse besteht bereits ein Konto."},{status:409});
  const organizationId=id("org"),userId=crypto.randomUUID();
  await db.batch([
   db.insert(organizations).values({id:organizationId,name:pending.fullName,billingEmail:email,createdAt:now}),
   db.insert(users).values({id:userId,organizationId,fullName:pending.fullName,email,passwordHash:pending.passwordHash,accountType:"consumer",emailVerifiedAt:now,status:"active",createdAt:now}),
   ...expected.map(row=>db.insert(legalAcknowledgements).values({id:id("lack"),userId,organizationId,documentVersionId:row.documentVersionId,documentKey:row.documentKey,documentVersion:row.documentVersion,documentHash:row.documentHash,acknowledgementType:row.acknowledgementType,acceptedAt:pending.acceptedAt,createdAt:now})),
   db.delete(pendingConsumerRegistrations).where(eq(pendingConsumerRegistrations.id,pending.id)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:userId,action:"consumer.registration_completed",entityType:"user",entityId:userId,createdAt:now})
  ]);
  return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("consumer_registration_verify_failed",error);return Response.json({error:"Registrierung konnte nicht abgeschlossen werden."},{status:500})}
}
