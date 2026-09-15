import {count,desc,eq} from "drizzle-orm";
import {redirect} from "next/navigation";
import {getDb} from "@/db";
import {auditLogs,emailSenderSettings,events,invoiceRequests,legalDocuments,organizations,users} from "@/db/schema";
import {legalDocumentDefaults,type LegalDocumentKey} from "@/lib/legal-documents";
import {platformOwner} from "@/lib/session";
import {OwnerDashboard} from "./dashboard-client";
import "./unternehmer.css";
import "./owner-enhancements.css";
import "./dashboard.css";
import "./billing-settings.css";
import "./legal-settings.css";
export const dynamic="force-dynamic";

export default async function UnternehmerPage(){
 const operator=await platformOwner();if(!operator)redirect("/unternehmer/login");
 const db=getDb();
 const [[orgCount],[userCount],[eventCount],[bookingCount],customers,eventRows,bookings,emailSettings,storedLegalDocuments,logs]=await Promise.all([
  db.select({value:count()}).from(organizations),
  db.select({value:count()}).from(users).where(eq(users.role,"customer")),
  db.select({value:count()}).from(events),
  db.select({value:count()}).from(invoiceRequests),
  db.select({id:users.id,name:users.fullName,email:users.email,status:users.status,createdAt:users.createdAt,organization:organizations.name}).from(users).innerJoin(organizations,eq(users.organizationId,organizations.id)).where(eq(users.role,"customer")).orderBy(desc(users.createdAt)).limit(50),
  db.select({id:events.id,customer:users.fullName,organization:organizations.name,createdAt:events.createdAt}).from(events).innerJoin(users,eq(events.ownerUserId,users.id)).innerJoin(organizations,eq(events.organizationId,organizations.id)).orderBy(desc(events.createdAt)).limit(50),
  db.select({id:invoiceRequests.id,customer:users.fullName,organization:organizations.name,email:invoiceRequests.email,helperLimit:events.helperLimit,amount:invoiceRequests.amountCents,currency:events.currency,createdAt:invoiceRequests.createdAt}).from(invoiceRequests).innerJoin(events,eq(invoiceRequests.eventId,events.id)).innerJoin(users,eq(events.ownerUserId,users.id)).innerJoin(organizations,eq(events.organizationId,organizations.id)).orderBy(desc(invoiceRequests.createdAt)).limit(500),
  db.select().from(emailSenderSettings),
  db.select().from(legalDocuments),
  db.select({id:auditLogs.id,action:auditLogs.action,entityType:auditLogs.entityType,createdAt:auditLogs.createdAt}).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(30)
 ]);
 const defaults={mfa:"noreply@rescueed.de",registration_link:"noreply@rescueed.de",password_reset:"noreply@rescueed.de",customer_contact:"kontakt@rescueed.de"};
 const settings=Object.fromEntries(Object.entries(defaults).map(([action,email])=>[action,emailSettings.find(x=>x.action===action)?.senderEmail||email]));
 const documents=(Object.keys(legalDocumentDefaults) as LegalDocumentKey[]).map(documentKey=>{const stored=storedLegalDocuments.find(item=>item.documentKey===documentKey),fallback=legalDocumentDefaults[documentKey];return {documentKey,title:stored?.title||fallback.title,version:stored?.version||fallback.version,content:stored?.content||fallback.content,status:stored?.status||"draft" as const}});
 return <OwnerDashboard operator={{name:operator.fullName,email:operator.email}} counts={{organizations:orgCount?.value??0,customers:userCount?.value??0,events:eventCount?.value??0,bookings:bookingCount?.value??0}} customers={customers.map(x=>({...x,createdAt:x.createdAt.toISOString()}))} events={eventRows.map(x=>({...x,createdAt:x.createdAt.toISOString()}))} bookings={bookings.map(x=>({...x,createdAt:x.createdAt.toISOString()}))} emailSettings={settings} legalDocuments={documents} logs={logs.map(x=>({...x,createdAt:x.createdAt.toISOString()}))}/>;
}
