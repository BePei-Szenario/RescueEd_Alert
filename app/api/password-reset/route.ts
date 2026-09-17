import {and,eq,gt,inArray,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,legalAcceptances,legalAcknowledgements,organizations,pendingRegistrations,securityTokens,sessions,users} from "@/db/schema";
import {currentRegistrationDocuments,evidenceFor,type LegalEvidence} from "@/lib/legal-registration";
import {hashSecret,id,tokenHash} from "@/lib/security";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {token,password}=await request.json() as {token?:string;password?:string};
  if(!token||token.length>200||!password||password.length<12||password.length>1024)return Response.json({error:"Ein Passwort mit mindestens 12 Zeichen ist erforderlich."},{status:400});
  const limit=await consumeRateLimit({scope:"password-reset-network",subject:requestNetwork(request),limit:30,windowMs:60*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const db=getDb(),hash=await tokenHash(token),now=new Date();
  const [record]=await db.select().from(securityTokens).where(and(eq(securityTokens.tokenHash,hash),inArray(securityTokens.purpose,["password_setup","password_reset"]),isNull(securityTokens.usedAt),gt(securityTokens.expiresAt,now))).limit(1);
  if(record){
   await db.batch([db.update(users).set({passwordHash:await hashSecret(password),emailVerifiedAt:now,status:"active"}).where(eq(users.id,record.userId)),db.update(securityTokens).set({usedAt:now}).where(eq(securityTokens.id,record.id)),db.delete(sessions).where(eq(sessions.userId,record.userId)),db.insert(auditLogs).values({id:id("aud"),actorUserId:record.userId,action:"password.changed",entityType:"user",entityId:record.userId,createdAt:now})]);
   return Response.json({ok:true,type:"password_reset"});
  }
  const [pending]=await db.select().from(pendingRegistrations).where(and(eq(pendingRegistrations.tokenHash,hash),isNull(pendingRegistrations.usedAt),gt(pendingRegistrations.expiresAt,now))).limit(1);
  if(!pending)return Response.json({error:"Der Passwortlink ist ungültig oder abgelaufen."},{status:400});
  const currentDocuments=await currentRegistrationDocuments();
  const currentEvidence=currentDocuments?evidenceFor(currentDocuments):null;
  let acceptedEvidence:LegalEvidence[]=[];
  try{acceptedEvidence=JSON.parse(pending.legalEvidenceJson||"[]") as LegalEvidence[]}catch{}
  if(!currentEvidence||acceptedEvidence.length!==currentEvidence.length||currentEvidence.some(document=>!acceptedEvidence.some(accepted=>accepted.documentVersionId===document.documentVersionId&&accepted.documentHash===document.documentHash&&accepted.acknowledgementType===document.acknowledgementType)))return Response.json({error:"Die Rechtstexte wurden seit Ihrer Anmeldung geändert. Bitte registrieren Sie sich erneut und bestätigen Sie die aktuellen Fassungen."},{status:409});
  const [existing]=await db.select({id:users.id}).from(users).where(eq(users.email,pending.email)).limit(1);
  if(existing)return Response.json({error:"Für diese E-Mail-Adresse besteht bereits ein Konto."},{status:409});
  const organizationId=id("org"),userId=id("usr");
  await db.batch([
   db.insert(organizations).values({id:organizationId,name:pending.organizationName,billingEmail:pending.email,billingStreet:pending.street,billingHouseNumber:pending.houseNumber,billingPostalCode:pending.postalCode,billingCity:pending.city,createdAt:now}),
   db.insert(users).values({id:userId,organizationId,fullName:pending.contactName,email:pending.email,passwordHash:await hashSecret(password),emailVerifiedAt:now,status:"active",createdAt:now}),
   db.insert(legalAcceptances).values({id:id("consent"),userId,termsVersion:pending.termsVersion,privacyVersion:pending.privacyVersion,avvVersion:pending.avvVersion,acceptedAt:pending.acceptedAt,createdAt:now}),
   ...currentEvidence.map(document=>db.insert(legalAcknowledgements).values({id:id("lack"),userId,organizationId,documentVersionId:document.documentVersionId,documentKey:document.documentKey,documentVersion:document.documentVersion,documentHash:document.documentHash,acknowledgementType:document.acknowledgementType,acceptedAt:pending.acceptedAt,createdAt:now})),
   db.delete(pendingRegistrations).where(eq(pendingRegistrations.id,pending.id)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:userId,action:"registration.completed",entityType:"user",entityId:userId,metadataJson:JSON.stringify({termsVersion:pending.termsVersion,privacyVersion:pending.privacyVersion,avvVersion:pending.avvVersion}),createdAt:now})
  ]);
  return Response.json({ok:true,type:"registration"});
 }catch(error){console.error("password_reset_failed",error);return Response.json({error:"Passwort konnte nicht gespeichert werden."},{status:500})}
}
