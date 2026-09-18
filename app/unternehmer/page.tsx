import {and,count,desc,eq,inArray,ne} from "drizzle-orm";
import {redirect} from "next/navigation";
import {getDb} from "@/db";
import {appSubscriptions,auditLogs,deletedCustomerArchives,emailSenderSettings,events,invoiceRequests,legalDocuments,legalDocumentVersions,organizations,users} from "@/db/schema";
import {legalDocumentDefaults,type LegalDocumentKey} from "@/lib/legal-documents";
import {platformOwner} from "@/lib/session";
import {OwnerDashboard} from "./dashboard-client";
import "./unternehmer.css";
import "./owner-enhancements.css";
import "./dashboard.css";
import "./billing-settings.css";
import "./legal-settings.css";
import "./customer-archive.css";
import "./support-panel.css";
export const dynamic="force-dynamic";

export default async function UnternehmerPage(){
 const operator=await platformOwner();if(!operator)redirect("/unternehmer/login");
 const db=getDb();
 const [[orgCount],[userCount],[eventCount],[bookingCount],customers,archives,bookings,emailSettings,storedLegalDocuments,legalVersions,logs]=await Promise.all([
  db.select({value:count()}).from(organizations),
  db.select({value:count()}).from(users).where(and(eq(users.role,"customer"),ne(users.status,"deleted"))),
  db.select({value:count()}).from(events),
  db.select({value:count()}).from(invoiceRequests),
  db.select({id:users.id,name:users.fullName,email:users.email,status:users.status,accountType:users.accountType,createdAt:users.createdAt,organization:organizations.name,complimentaryAccess:organizations.complimentaryAccess,unlimitedEventDuration:organizations.unlimitedEventDuration}).from(users).innerJoin(organizations,eq(users.organizationId,organizations.id)).where(and(eq(users.role,"customer"),ne(users.status,"deleted"))).orderBy(desc(users.createdAt)).limit(50),
  db.select().from(deletedCustomerArchives).orderBy(desc(deletedCustomerArchives.deletedAt)).limit(100),
  db.select({id:invoiceRequests.id,customer:users.fullName,organization:organizations.name,email:invoiceRequests.email,helperLimit:events.helperLimit,amount:invoiceRequests.amountCents,currency:events.currency,createdAt:invoiceRequests.createdAt}).from(invoiceRequests).innerJoin(events,eq(invoiceRequests.eventId,events.id)).innerJoin(users,eq(events.ownerUserId,users.id)).innerJoin(organizations,eq(events.organizationId,organizations.id)).orderBy(desc(invoiceRequests.createdAt)).limit(500),
  db.select().from(emailSenderSettings),
  db.select().from(legalDocuments),
  db.select().from(legalDocumentVersions).orderBy(desc(legalDocumentVersions.publishedAt)),
  db.select({id:auditLogs.id,action:auditLogs.action,entityType:auditLogs.entityType,createdAt:auditLogs.createdAt}).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(30)
 ]);
 const consumerIds=customers.filter(customer=>customer.accountType==="consumer").map(customer=>customer.id);
 const subscriptions=consumerIds.length?await db.select({userId:appSubscriptions.userId,store:appSubscriptions.store,status:appSubscriptions.status,expiresAt:appSubscriptions.expiresAt,lastVerifiedAt:appSubscriptions.lastVerifiedAt}).from(appSubscriptions).where(inArray(appSubscriptions.userId,consumerIds)).orderBy(desc(appSubscriptions.lastVerifiedAt)):[];
 const defaults={mfa:process.env.MAIL_FROM_MFA||"noreply_ra@rescueed.de",registration_link:process.env.MAIL_FROM_MFA||"noreply_ra@rescueed.de",password_reset:process.env.MAIL_FROM_MFA||"noreply_ra@rescueed.de",customer_contact:process.env.MAIL_FROM_CONTACT||"info_ra@rescueed.de"};
 const settings=Object.fromEntries(Object.entries(defaults).map(([action,email])=>[action,emailSettings.find(x=>x.action===action)?.senderEmail||email]));
 const documents=(Object.keys(legalDocumentDefaults) as LegalDocumentKey[]).map(documentKey=>{const stored=storedLegalDocuments.find(item=>item.documentKey===documentKey),fallback=legalDocumentDefaults[documentKey];return {documentKey,title:stored?.title||fallback.title,version:stored?.version||fallback.version,content:stored?.content||fallback.content,status:stored?.status||"draft" as const}});
 const archivedCustomers=archives.map(item=>{
  let legalVersions="Nachweis gespeichert";
  let legalEvidence:Array<{documentKey:string;version:string;contentHash:string;acceptedAt:string;title:string|null;content:string|null}>=[];
  try{
   const snapshot=JSON.parse(item.legalSnapshotJson) as {acceptances?:Array<{termsVersion:string;privacyVersion:string;avvVersion:string}>;acknowledgements?:typeof legalEvidence};
   if(snapshot.acknowledgements?.length){legalEvidence=snapshot.acknowledgements;legalVersions=legalEvidence.map(entry=>`${entry.documentKey.toUpperCase()} ${entry.version}`).join(" · ")}
   else{const acceptance=snapshot.acceptances?.at(-1);if(acceptance)legalVersions=`AGB ${acceptance.termsVersion} · Datenschutz ${acceptance.privacyVersion} · AVV ${acceptance.avvVersion}`}
  }catch{}
  return {id:item.id,name:item.fullName,email:item.email,organization:item.organizationName,deletedAt:item.deletedAt.toISOString(),retentionReviewAt:item.retentionReviewAt.toISOString(),legalVersions,legalEvidence};
 });
 return <OwnerDashboard operator={{name:operator.fullName,email:operator.email}} counts={{organizations:orgCount?.value??0,customers:userCount?.value??0,events:eventCount?.value??0,bookings:bookingCount?.value??0}} customers={customers.map(x=>{const subscription=subscriptions.find(item=>item.userId===x.id);return {...x,createdAt:x.createdAt.toISOString(),subscription:subscription?{store:subscription.store,status:subscription.status,expiresAt:subscription.expiresAt?.toISOString()||null,lastVerifiedAt:subscription.lastVerifiedAt?.toISOString()||null}:null}})} archivedCustomers={archivedCustomers} bookings={bookings.map(x=>({...x,createdAt:x.createdAt.toISOString()}))} emailSettings={settings} legalDocuments={documents} legalVersions={legalVersions.map(x=>({documentKey:x.documentKey,title:x.title,version:x.version,content:x.content,contentHash:x.contentHash,publishedAt:x.publishedAt.toISOString(),archivedAt:x.archivedAt?.toISOString()||null}))} logs={logs.map(x=>({...x,createdAt:x.createdAt.toISOString()}))}/>;
}
