import {and,count,desc,eq,inArray,isNull,ne} from "drizzle-orm";
import {redirect} from "next/navigation";
import {getDb} from "@/db";
import {appSubscriptions,appSubscriptionWithdrawals,auditLogs,billingRecords,deletedCustomerArchives,emailSenderSettings,events,legalDocuments,legalDocumentVersions,organizations,retentionHolds,users} from "@/db/schema";
import {legalDocumentDefaults,type LegalDocumentKey} from "@/lib/legal-documents";
import {platformStaff} from "@/lib/session";
import {OwnerDashboard} from "./dashboard-client";
import {StaffDashboard} from "./staff-dashboard";
import "./unternehmer.css";
import "./owner-enhancements.css";
import "./dashboard.css";
import "./compact-layout.css";
import "./billing-settings.css";
import "./legal-settings.css";
import "./customer-archive.css";
import "./support-panel.css";
import "./staff-management.css";
import "./archive-nav.css";
export const dynamic="force-dynamic";

export default async function UnternehmerPage(){
 const operator=await platformStaff();if(!operator)redirect("/unternehmer/login");
 const db=getDb();
 if(operator.role==="platform_staff"){
  const [staffCustomers,staffBookings]=await Promise.all([
   db.select({id:users.id,name:users.fullName,email:users.email,status:users.status,accountType:users.accountType,organization:organizations.name}).from(users).innerJoin(organizations,eq(users.organizationId,organizations.id)).where(and(eq(users.role,"customer"),ne(users.status,"deleted"))).orderBy(desc(users.createdAt)).limit(50),
   db.select({id:billingRecords.id,customer:billingRecords.customerName,organization:billingRecords.organizationName,email:billingRecords.email,amount:billingRecords.amountCents,createdAt:billingRecords.createdAt}).from(billingRecords).orderBy(desc(billingRecords.createdAt)).limit(500)
  ]);
  return <StaffDashboard operator={{name:operator.fullName,email:operator.email}} customers={staffCustomers} bookings={staffBookings.map(item=>({...item,createdAt:item.createdAt.toISOString()}))}/>;
 }
 const [[orgCount],[userCount],[eventCount],[bookingCount],customers,archives,bookings,emailSettings,storedLegalDocuments,legalVersions,logs]=await Promise.all([
  db.select({value:count()}).from(organizations),
  db.select({value:count()}).from(users).where(and(eq(users.role,"customer"),ne(users.status,"deleted"))),
  db.select({value:count()}).from(events),
  db.select({value:count()}).from(billingRecords),
  db.select({id:users.id,name:users.fullName,email:users.email,status:users.status,accountType:users.accountType,createdAt:users.createdAt,organization:organizations.name,organizationType:organizations.organizationType,complimentaryAccess:organizations.complimentaryAccess,unlimitedEventDuration:organizations.unlimitedEventDuration}).from(users).innerJoin(organizations,eq(users.organizationId,organizations.id)).where(and(eq(users.role,"customer"),ne(users.status,"deleted"))).orderBy(desc(users.createdAt)).limit(50),
  db.select().from(deletedCustomerArchives).orderBy(desc(deletedCustomerArchives.deletedAt)).limit(100),
  db.select({id:billingRecords.id,customer:billingRecords.customerName,organization:billingRecords.organizationName,email:billingRecords.email,helperLimit:billingRecords.helperLimit,amount:billingRecords.amountCents,currency:billingRecords.currency,createdAt:billingRecords.createdAt}).from(billingRecords).orderBy(desc(billingRecords.createdAt)).limit(500),
  db.select().from(emailSenderSettings),
  db.select().from(legalDocuments),
  db.select().from(legalDocumentVersions).orderBy(desc(legalDocumentVersions.publishedAt)),
  db.select({id:auditLogs.id,action:auditLogs.action,entityType:auditLogs.entityType,createdAt:auditLogs.createdAt}).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(30)
 ]);
 const consumerIds=customers.filter(customer=>customer.accountType==="consumer").map(customer=>customer.id);
 const staffAccounts=operator.role==="platform_owner"?await db.select({id:users.id,name:users.fullName,email:users.email,status:users.status,createdAt:users.createdAt,emailVerifiedAt:users.emailVerifiedAt}).from(users).where(eq(users.role,"platform_staff")).orderBy(desc(users.createdAt)):[];
 if(operator.role!=="platform_owner")redirect("/unternehmer/login");
 const archiveHolds=archives.length?await db.select({entityId:retentionHolds.entityId}).from(retentionHolds).where(and(eq(retentionHolds.entityType,"contract_evidence"),isNull(retentionHolds.releasedAt),inArray(retentionHolds.entityId,archives.map(item=>item.id)))):[];
 const subscriptions=consumerIds.length?await db.select({id:appSubscriptions.id,userId:appSubscriptions.userId,store:appSubscriptions.store,status:appSubscriptions.status,purchasedAt:appSubscriptions.purchasedAt,expiresAt:appSubscriptions.expiresAt,lastVerifiedAt:appSubscriptions.lastVerifiedAt}).from(appSubscriptions).where(inArray(appSubscriptions.userId,consumerIds)).orderBy(desc(appSubscriptions.lastVerifiedAt)):[];
 const withdrawals=consumerIds.length?await db.select({id:appSubscriptionWithdrawals.id,userId:appSubscriptionWithdrawals.userId,subscriptionId:appSubscriptionWithdrawals.subscriptionId,status:appSubscriptionWithdrawals.status,requestedAt:appSubscriptionWithdrawals.requestedAt}).from(appSubscriptionWithdrawals).where(inArray(appSubscriptionWithdrawals.userId,consumerIds)).orderBy(desc(appSubscriptionWithdrawals.requestedAt)):[];
 const defaults={mfa:process.env.MAIL_FROM_MFA||"noreply_ra@rescueed.de",registration_link:process.env.MAIL_FROM_MFA||"noreply_ra@rescueed.de",password_reset:process.env.MAIL_FROM_MFA||"noreply_ra@rescueed.de",customer_contact:process.env.MAIL_FROM_CONTACT||"info_ra@rescueed.de"};
 const settings=Object.fromEntries(Object.entries(defaults).map(([action,email])=>[action,emailSettings.find(x=>x.action===action)?.senderEmail||email]));
 const documents=(Object.keys(legalDocumentDefaults) as LegalDocumentKey[]).map(documentKey=>{const stored=storedLegalDocuments.find(item=>item.documentKey===documentKey),fallback=legalDocumentDefaults[documentKey],pendingB2cUpgrade=(documentKey==="agb_b2c"||documentKey==="widerruf")&&stored?.version==="2026-09-17-b2c-2"&&fallback.version==="2026-09-21-b2c-3";return pendingB2cUpgrade?{documentKey,title:fallback.title,version:fallback.version,content:fallback.content,status:"draft" as const}:{documentKey,title:stored?.title||fallback.title,version:stored?.version||fallback.version,content:stored?.content||fallback.content,status:stored?.status||"draft" as const}});
 const archivedCustomers=archives.map(item=>{
  let legalVersions="Nachweis gespeichert";
  let legalEvidence:Array<{documentKey:string;version:string;contentHash:string;acceptedAt:string;title:string|null;content:string|null}>=[];
  try{
   const snapshot=JSON.parse(item.legalSnapshotJson) as {acceptances?:Array<{termsVersion:string;privacyVersion:string;avvVersion:string}>;acknowledgements?:typeof legalEvidence};
   if(snapshot.acknowledgements?.length){legalEvidence=snapshot.acknowledgements;legalVersions=legalEvidence.map(entry=>`${entry.documentKey.toUpperCase()} ${entry.version}`).join(" · ")}
   else{const acceptance=snapshot.acceptances?.at(-1);if(acceptance)legalVersions=`AGB ${acceptance.termsVersion} · Datenschutz ${acceptance.privacyVersion} · AVV ${acceptance.avvVersion}`}
  }catch{}
  return {id:item.id,name:item.fullName,email:item.email,organization:item.organizationName,deletedAt:item.deletedAt.toISOString(),retentionReviewAt:item.retentionReviewAt.toISOString(),retentionHeld:archiveHolds.some(hold=>hold.entityId===item.id),legalVersions,legalEvidence};
 });
 return <OwnerDashboard operator={{name:operator.fullName,email:operator.email,role:operator.role}} staffAccounts={staffAccounts.map(item=>({...item,createdAt:item.createdAt.toISOString(),emailVerifiedAt:item.emailVerifiedAt?.toISOString()??null}))} counts={{organizations:orgCount?.value??0,customers:userCount?.value??0,events:eventCount?.value??0,bookings:bookingCount?.value??0}} customers={customers.map(x=>{const subscription=subscriptions.find(item=>item.userId===x.id),withdrawal=withdrawals.find(item=>item.userId===x.id&&item.subscriptionId===subscription?.id);return {...x,createdAt:x.createdAt.toISOString(),subscription:subscription?{store:subscription.store,status:subscription.status,purchasedAt:subscription.purchasedAt?.toISOString()||null,expiresAt:subscription.expiresAt?.toISOString()||null,lastVerifiedAt:subscription.lastVerifiedAt?.toISOString()||null,withdrawal:withdrawal?{id:withdrawal.id,status:withdrawal.status,requestedAt:withdrawal.requestedAt.toISOString()}:null}:null}})} archivedCustomers={operator.role==="platform_owner"?archivedCustomers:[]} bookings={bookings.map(x=>({...x,createdAt:x.createdAt.toISOString()}))} emailSettings={operator.role==="platform_owner"?settings:{}} legalDocuments={operator.role==="platform_owner"?documents:[]} legalVersions={(operator.role==="platform_owner"?legalVersions:[]).map(x=>({documentKey:x.documentKey,title:x.title,version:x.version,content:x.content,contentHash:x.contentHash,publishedAt:x.publishedAt.toISOString(),archivedAt:x.archivedAt?.toISOString()||null}))} logs={(operator.role==="platform_owner"?logs:[]).map(x=>({...x,createdAt:x.createdAt.toISOString()}))}/>;
}
