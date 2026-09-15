import {and,eq,gt,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,legalAcceptances,organizations,pendingRegistrations,securityTokens,sessions,users} from "@/db/schema";
import {hashSecret,id,tokenHash} from "@/lib/security";
import {rejectCrossSiteMutation} from "@/lib/request-security";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {token,password}=await request.json() as {token?:string;password?:string};
  if(!token||!password||password.length<12)return Response.json({error:"Ein Passwort mit mindestens 12 Zeichen ist erforderlich."},{status:400});
  const db=getDb(),hash=await tokenHash(token),now=new Date();
  const [record]=await db.select().from(securityTokens).where(and(eq(securityTokens.tokenHash,hash),isNull(securityTokens.usedAt),gt(securityTokens.expiresAt,now))).limit(1);
  if(record&&["password_setup","password_reset"].includes(record.purpose)){
   await db.batch([db.update(users).set({passwordHash:await hashSecret(password),emailVerifiedAt:now,status:"active"}).where(eq(users.id,record.userId)),db.update(securityTokens).set({usedAt:now}).where(eq(securityTokens.id,record.id)),db.delete(sessions).where(eq(sessions.userId,record.userId)),db.insert(auditLogs).values({id:id("aud"),actorUserId:record.userId,action:"password.changed",entityType:"user",entityId:record.userId,createdAt:now})]);
   return Response.json({ok:true,type:"password_reset"});
  }
  const [pending]=await db.select().from(pendingRegistrations).where(and(eq(pendingRegistrations.tokenHash,hash),isNull(pendingRegistrations.usedAt),gt(pendingRegistrations.expiresAt,now))).limit(1);
  if(!pending)return Response.json({error:"Der Passwortlink ist ungültig oder abgelaufen."},{status:400});
  const [existing]=await db.select({id:users.id}).from(users).where(eq(users.email,pending.email)).limit(1);
  if(existing)return Response.json({error:"Für diese E-Mail-Adresse besteht bereits ein Konto."},{status:409});
  const organizationId=id("org"),userId=id("usr");
  await db.batch([
   db.insert(organizations).values({id:organizationId,name:pending.organizationName,billingEmail:pending.email,billingStreet:pending.street,billingHouseNumber:pending.houseNumber,billingPostalCode:pending.postalCode,billingCity:pending.city,createdAt:now}),
   db.insert(users).values({id:userId,organizationId,fullName:pending.contactName,email:pending.email,passwordHash:await hashSecret(password),emailVerifiedAt:now,status:"active",createdAt:now}),
   db.insert(legalAcceptances).values({id:id("consent"),userId,termsVersion:pending.termsVersion,privacyVersion:pending.privacyVersion,avvVersion:pending.avvVersion,acceptedAt:pending.acceptedAt,createdAt:now}),
   db.delete(pendingRegistrations).where(eq(pendingRegistrations.id,pending.id)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:userId,action:"registration.completed",entityType:"user",entityId:userId,metadataJson:JSON.stringify({termsVersion:pending.termsVersion,privacyVersion:pending.privacyVersion,avvVersion:pending.avvVersion}),createdAt:now})
  ]);
  return Response.json({ok:true,type:"registration"});
 }catch(error){console.error("password_reset_failed",error);return Response.json({error:"Passwort konnte nicht gespeichert werden."},{status:500})}
}
