import {and,eq,inArray} from "drizzle-orm";
import {getDb} from "@/db";
import {appSubscriptions,auditLogs,deletedCustomerArchives,events,legalAcceptances,legalAcknowledgements,legalDocuments,legalDocumentVersions,organizations,securityTokens,sessions,supportTickets,users} from "@/db/schema";
import {legalDocumentDefaults,type LegalDocumentKey} from "@/lib/legal-documents";
import {clearRateLimit,consumeRateLimit,rateLimited} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {hashSecret,id,verifySecret} from "@/lib/security";
import {currentUser} from "@/lib/session";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const account=await currentUser();
  if(!account)return Response.json({error:"Bitte zuerst anmelden."},{status:401});
  if(account.role!=="customer")return Response.json({error:"Dieses Konto kann hier nicht gelöscht werden."},{status:403});
  const {password,confirmed}=await request.json() as {password?:string;confirmed?:boolean};
  if(!confirmed||!password||password.length>1024)return Response.json({error:"Passwort und ausdrückliche Bestätigung sind erforderlich."},{status:400});
  const limit=await consumeRateLimit({scope:"account-delete-user",subject:account.id,limit:5,windowMs:15*60_000});
  if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const db=getDb(),[user]=await db.select().from(users).where(eq(users.id,account.id)).limit(1);
  if(!user||user.status!=="active"||user.protectedAccount)return Response.json({error:"Dieses Konto kann nicht gelöscht werden."},{status:403});
  if(!await verifySecret(password,user.passwordHash))return Response.json({error:"Das eingegebene Passwort ist nicht korrekt."},{status:401});
  const [organization]=await db.select().from(organizations).where(eq(organizations.id,user.organizationId)).limit(1);
  if(!organization)return Response.json({error:"Organisation nicht gefunden."},{status:404});
  const [acceptances,acknowledgements,storedDocuments,versionDocuments]=await Promise.all([
   db.select().from(legalAcceptances).where(eq(legalAcceptances.userId,user.id)),
   db.select().from(legalAcknowledgements).where(eq(legalAcknowledgements.userId,user.id)),
   db.select().from(legalDocuments),
   db.select().from(legalDocumentVersions)
  ]);
  const documents=(Object.keys(legalDocumentDefaults) as LegalDocumentKey[]).map(documentKey=>{
   const stored=storedDocuments.find(item=>item.documentKey===documentKey),fallback=legalDocumentDefaults[documentKey];
   return {documentKey,title:stored?.title||fallback.title,version:stored?.version||fallback.version,content:stored?.content||fallback.content,status:stored?.status||"draft"};
  });
  const now=new Date(),retentionReviewAt=new Date(now);retentionReviewAt.setUTCFullYear(retentionReviewAt.getUTCFullYear()+3);
  const archiveId=id("arc"),anonymousEmail=`deleted-${crypto.randomUUID()}@invalid.local`;
  await db.batch([
   db.insert(deletedCustomerArchives).values({id:archiveId,sourceUserId:user.id,sourceOrganizationId:organization.id,fullName:user.fullName,email:user.email,organizationName:organization.name,billingEmail:organization.billingEmail,billingStreet:organization.billingStreet,billingHouseNumber:organization.billingHouseNumber,billingPostalCode:organization.billingPostalCode,billingCity:organization.billingCity,legalSnapshotJson:JSON.stringify({accountType:user.accountType,acceptances:acceptances.map(item=>({termsVersion:item.termsVersion,privacyVersion:item.privacyVersion,avvVersion:item.avvVersion,acceptedAt:item.acceptedAt.toISOString()})),acknowledgements:acknowledgements.map(item=>{const document=versionDocuments.find(version=>version.id===item.documentVersionId);return {documentKey:item.documentKey,version:item.documentVersion,contentHash:item.documentHash,acknowledgementType:item.acknowledgementType,acceptedAt:item.acceptedAt.toISOString(),title:document?.title||null,content:document?.content||null,publishedAt:document?.publishedAt.toISOString()||null}}),documents:acknowledgements.length?undefined:documents}),accountCreatedAt:user.createdAt,deletedAt:now,retentionReviewAt,createdAt:now}),
   db.delete(sessions).where(eq(sessions.userId,user.id)),
   db.delete(securityTokens).where(eq(securityTokens.userId,user.id)),
   db.delete(appSubscriptions).where(eq(appSubscriptions.userId,user.id)),
   db.delete(supportTickets).where(eq(supportTickets.requesterUserId,user.id)),
   db.update(events).set({status:"cancelled",endedAt:now}).where(and(eq(events.ownerUserId,user.id),inArray(events.status,["draft","active"]))),
   db.update(users).set({fullName:"Gelöschter Kunde",email:anonymousEmail,passwordHash:await hashSecret(crypto.randomUUID()+crypto.randomUUID()),status:"deleted",mfaEnabled:false,emailVerifiedAt:null,lastLoginAt:null,deletedAt:now}).where(eq(users.id,user.id)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:user.id,action:"account.deleted_by_customer",entityType:"deleted_customer_archive",entityId:archiveId,metadataJson:JSON.stringify({organizationId:organization.id,legalAcceptanceCount:acceptances.length}),createdAt:now})
  ]);
  await clearRateLimit("account-delete-user",account.id);
  return Response.json({ok:true},{headers:{"cache-control":"no-store","set-cookie":"rescueed_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"}});
 }catch(error){console.error("account_delete_failed",error);return Response.json({error:"Das Konto konnte nicht gelöscht werden."},{status:500})}
}
