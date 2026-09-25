import Link from "next/link";
import type {ReactNode} from "react";
import {and,asc,desc,eq,inArray,like,or} from "drizzle-orm";
import {redirect} from "next/navigation";
import {getDb} from "@/db";
import {
 auditLogs,billingRecords,deletedCustomerArchives,events,legalAcknowledgements,
 legalDocumentVersions,organizations,retentionActions,supportMessages,supportTickets,users
} from "@/db/schema";
import {RescueEdLogo} from "@/components/brand-logo";
import {platformOwner} from "@/lib/session";
import {legalPdfUrl} from "@/lib/legal-document-file";
import {LogoutButton} from "../actions";
import "../unternehmer.css";
import "../owner-enhancements.css";
import "../dashboard.css";
import "../compact-layout.css";
import "./archive.css";

export const dynamic="force-dynamic";

type Category="kunden"|"support"|"rechtstexte"|"bestaetigungen"|"buchungen"|"events"|"audit"|"loeschprotokoll";
const categories:{key:Category;label:string}[]=[
 {key:"kunden",label:"Gelöschte Kunden"},
 {key:"support",label:"Support-Tickets"},
 {key:"rechtstexte",label:"Rechtstext-Versionen"},
 {key:"bestaetigungen",label:"Bestätigungen"},
 {key:"buchungen",label:"Buchungsbelege"},
 {key:"events",label:"Gespeicherte Events"},
 {key:"audit",label:"Audit-Verlauf"},
 {key:"loeschprotokoll",label:"Löschprotokoll"}
];
const pageSize=50;
const date=(value:Date|string|number|null)=>value?new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"–";
const euro=(cents:number)=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(cents/100);
function pretty(value:string){try{return JSON.stringify(JSON.parse(value),null,2)}catch{return "Gespeicherter Nachweis konnte nicht gelesen werden."}}

function ArchiveEntry({title,meta,children}:{title:string;meta:string;children:ReactNode}){
 return <details className="archive-entry">
  <summary><span className="archive-entry-heading"><b>{title}</b><small>{meta}</small></span><span className="archive-entry-toggle" aria-hidden="true">Details</span></summary>
  <div className="archive-entry-content">{children}</div>
 </details>;
}

export default async function ArchivePage({searchParams}:{searchParams:Promise<{bereich?:string;seite?:string;q?:string}>}){
 const owner=await platformOwner();
 if(!owner)redirect("/unternehmer/login");
 const params=await searchParams;
 const category=categories.find(item=>item.key===params.bereich)?.key??"kunden";
 const parsedPage=Number(params.seite);
 const page=Number.isSafeInteger(parsedPage)&&parsedPage>0?Math.min(parsedPage,10000):1;
 const query=(params.q??"").trim().slice(0,120),search=`%${query}%`,offset=(page-1)*pageSize;
 const db=getDb();
 let cards:ReactNode[]=[];
 let hasNext=false;

 if(category==="kunden"){
  const rows=await db.select().from(deletedCustomerArchives).where(query?or(like(deletedCustomerArchives.fullName,search),like(deletedCustomerArchives.email,search),like(deletedCustomerArchives.organizationName,search)):undefined).orderBy(desc(deletedCustomerArchives.deletedAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;
  cards=rows.slice(0,pageSize).map(row=><ArchiveEntry key={row.id} title={`${row.organizationName} · ${row.fullName}`} meta={`${row.email} · gelöscht ${date(row.deletedAt)}`}><p>Prüfung der Aufbewahrung ab {date(row.retentionReviewAt)}</p><h3>Vertrags- und Rechtstextnachweise</h3><pre>{pretty(row.legalSnapshotJson)}</pre></ArchiveEntry>);
 }else if(category==="support"){
  const rows=await db.select({id:supportTickets.id,subject:supportTickets.subject,requesterType:supportTickets.requesterType,requesterName:users.fullName,requesterEmail:users.email,eventId:supportTickets.eventId,resolvedAt:supportTickets.resolvedAt,createdAt:supportTickets.createdAt,updatedAt:supportTickets.updatedAt}).from(supportTickets).leftJoin(users,eq(supportTickets.requesterUserId,users.id)).where(and(eq(supportTickets.status,"resolved"),query?or(like(supportTickets.subject,search),like(supportTickets.id,search),like(supportTickets.eventId,search),like(users.fullName,search),like(users.email,search)):undefined)).orderBy(desc(supportTickets.resolvedAt),desc(supportTickets.updatedAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;
  const visibleRows=rows.slice(0,pageSize);
  const messages=visibleRows.length?await db.select().from(supportMessages).where(inArray(supportMessages.ticketId,visibleRows.map(row=>row.id))).orderBy(asc(supportMessages.createdAt)):[];
  const messagesByTicket=new Map<string,typeof messages>();
  for(const message of messages){const list=messagesByTicket.get(message.ticketId)??[];list.push(message);messagesByTicket.set(message.ticketId,list)}
  cards=visibleRows.map(row=>{
   const requester=row.requesterName??row.requesterEmail??(row.requesterType==="helper"?"Temporärer Helferzugang":"Gelöschtes Konto");
   return <ArchiveEntry key={row.id} title={row.subject} meta={`${requester} · erledigt ${date(row.resolvedAt??row.updatedAt)}`}>
    <dl className="archive-facts"><div><dt>Ticketnummer</dt><dd><code>{row.id}</code></dd></div><div><dt>Erstellt</dt><dd>{date(row.createdAt)}</dd></div><div><dt>Event</dt><dd>{row.eventId??"Kein Event zugeordnet"}</dd></div></dl>
    <h3>Nachrichtenverlauf</h3>
    <div className="archive-thread">{(messagesByTicket.get(row.id)??[]).map(message=><article key={message.id} className={`archive-message archive-message--${message.authorType}`}><b>{message.authorType==="support"?"Support":"Anfragende Person"}</b><small>{date(message.createdAt)}</small><p>{message.body}</p></article>)}</div>
   </ArchiveEntry>;
  });
 }else if(category==="rechtstexte"){
  const rows=await db.select({id:legalDocumentVersions.id,documentKey:legalDocumentVersions.documentKey,title:legalDocumentVersions.title,version:legalDocumentVersions.version,content:legalDocumentVersions.content,pdfFileName:legalDocumentVersions.pdfFileName,contentHash:legalDocumentVersions.contentHash,publishedAt:legalDocumentVersions.publishedAt,archivedAt:legalDocumentVersions.archivedAt}).from(legalDocumentVersions).where(query?or(like(legalDocumentVersions.title,search),like(legalDocumentVersions.version,search),like(legalDocumentVersions.documentKey,search)):undefined).orderBy(desc(legalDocumentVersions.publishedAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;
  cards=rows.slice(0,pageSize).map(row=><ArchiveEntry key={row.id} title={`${row.title} · Version ${row.version}`} meta={`${row.documentKey} · veröffentlicht ${date(row.publishedAt)}`}><p>{row.archivedAt?`Archiviert ${date(row.archivedAt)}`:"Aktuelle Fassung"}</p><p>SHA-256: <code>{row.contentHash}</code></p>{row.pdfFileName&&<p><a href={legalPdfUrl(row.documentKey,row.id)} target="_blank" rel="noreferrer">Gespeicherte PDF öffnen · {row.pdfFileName}</a></p>}<h3>Gespeicherter Wortlaut</h3><pre>{row.content}</pre></ArchiveEntry>);
 }else if(category==="bestaetigungen"){
  const rows=await db.select({id:legalAcknowledgements.id,person:users.fullName,email:users.email,organization:organizations.name,key:legalAcknowledgements.documentKey,version:legalAcknowledgements.documentVersion,hash:legalAcknowledgements.documentHash,type:legalAcknowledgements.acknowledgementType,acceptedAt:legalAcknowledgements.acceptedAt}).from(legalAcknowledgements).innerJoin(users,eq(users.id,legalAcknowledgements.userId)).innerJoin(organizations,eq(organizations.id,legalAcknowledgements.organizationId)).where(query?or(like(users.fullName,search),like(users.email,search),like(organizations.name,search),like(legalAcknowledgements.documentKey,search)):undefined).orderBy(desc(legalAcknowledgements.acceptedAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;
  cards=rows.slice(0,pageSize).map(row=><ArchiveEntry key={row.id} title={`${row.organization} · ${row.person}`} meta={`${row.email} · ${row.type==="accepted"?"bestätigt":"gelesen"} ${date(row.acceptedAt)}`}><p>{row.key.toUpperCase()} · Version {row.version}</p><p>SHA-256: <code>{row.hash}</code></p></ArchiveEntry>);
 }else if(category==="buchungen"){
  const rows=await db.select().from(billingRecords).where(query?or(like(billingRecords.customerName,search),like(billingRecords.organizationName,search),like(billingRecords.eventName,search),like(billingRecords.email,search)):undefined).orderBy(desc(billingRecords.createdAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;
  cards=rows.slice(0,pageSize).map(row=><ArchiveEntry key={row.id} title={`${row.organizationName} · ${row.eventName}`} meta={`Gebucht ${date(row.createdAt)} · ${euro(row.amountCents)} · ${row.helperLimit} Helfer`}><p>{row.recipientName} · {row.street}, {row.postalCode} {row.city} · {row.email}</p><p>Eventdatum {row.eventDate} · Beleg {row.id} · Aufbewahrung bis {date(row.retainUntil)}</p></ArchiveEntry>);
 }else if(category==="events"){
  const rows=await db.select({id:events.id,name:events.name,organization:organizations.name,eventDate:events.eventDate,endDate:events.endDate,helperLimit:events.helperLimit,priceCents:events.priceCents,status:events.status,createdAt:events.createdAt}).from(events).innerJoin(organizations,eq(organizations.id,events.organizationId)).where(query?or(like(events.name,search),like(organizations.name,search),like(events.id,search)):undefined).orderBy(desc(events.createdAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;
  cards=rows.slice(0,pageSize).map(row=><ArchiveEntry key={row.id} title={`${row.name} · ${row.organization}`} meta={`${row.eventDate}${row.endDate&&row.endDate!==row.eventDate?` – ${row.endDate}`:""} · ${row.status}`}><p>{row.helperLimit} Helfer · {euro(row.priceCents)}</p><p>Erstellt {date(row.createdAt)} · Eventnummer <code>{row.id}</code></p></ArchiveEntry>);
 }else if(category==="audit"){
  const rows=await db.select({id:auditLogs.id,action:auditLogs.action,entityType:auditLogs.entityType,entityId:auditLogs.entityId,metadataJson:auditLogs.metadataJson,createdAt:auditLogs.createdAt,actor:users.fullName}).from(auditLogs).leftJoin(users,eq(users.id,auditLogs.actorUserId)).where(query?or(like(auditLogs.action,search),like(auditLogs.entityType,search),like(auditLogs.entityId,search)):undefined).orderBy(desc(auditLogs.createdAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;
  cards=rows.slice(0,pageSize).map(row=><ArchiveEntry key={row.id} title={row.action} meta={`${date(row.createdAt)} · ${row.actor??"System"}`}><p>{row.entityType} · {row.entityId??"–"}</p>{row.metadataJson&&<><h3>Gespeicherte Metadaten</h3><pre>{pretty(row.metadataJson)}</pre></>}</ArchiveEntry>);
 }else{
  const rows=await db.select().from(retentionActions).where(query?or(like(retentionActions.entityType,search),like(retentionActions.action,search)):undefined).orderBy(desc(retentionActions.createdAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;
  cards=rows.slice(0,pageSize).map(row=><ArchiveEntry key={row.id} title={`${row.entityType} · ${row.action}`} meta={`${date(row.createdAt)} · Protokoll bis ${date(row.retainUntil)}`}><p>Datensatz-Hash: <code>{row.entityHash}</code></p></ArchiveEntry>);
 }

 const archiveUrl=(targetPage:number)=>`/unternehmer/archiv?bereich=${category}&seite=${targetPage}${query?`&q=${encodeURIComponent(query)}`:""}`;
 const categoryLabel=categories.find(item=>item.key===category)?.label;
 return <main className="owner owner-tabs archive-page">
  <aside><div className="ownerbrand"><RescueEdLogo className="brand-logo--owner"/><div><b>RescueEd Alert</b><span>Unternehmerbereich</span></div></div><nav aria-label="Unternehmerbereiche"><Link href="/unternehmer#uebersicht">← Übersicht</Link><Link className="selected" href="/unternehmer/archiv">Archiv</Link></nav><div className="asidebottom"><Link className="backtosite" href="/profil">Mein Profil</Link><LogoutButton/></div></aside>
  <section className="ownercontent"><header><div><p>INTERNER SAAS-BEREICH</p><h1>Archiv & Nachweise</h1><span>Lesender Zugriff auf gespeicherte Vertrags-, Buchungs-, Support- und Verlaufseinträge.</span></div><div className="operator"><b>{owner.fullName}</b></div></header>
   <div className="archive-notice">Erledigte Support-Tickets werden automatisch aus der aktiven Supportliste in dieses Archiv verschoben. Es werden vorhandene Datensätze angezeigt, keine zusätzlichen Kopien angelegt. Passwörter, Sitzungstokens und E-Mail-Inhalte sind hier aus Sicherheitsgründen nicht sichtbar.</div>
   <nav className="archive-categories" aria-label="Archivbereiche">{categories.map(item=><Link key={item.key} className={category===item.key?"active":""} href={`/unternehmer/archiv?bereich=${item.key}`}>{item.label}</Link>)}</nav>
   <section className="area-panel"><form className="archive-search" action="/unternehmer/archiv" method="GET"><input type="hidden" name="bereich" value={category}/><label>Archiv durchsuchen<input name="q" type="search" defaultValue={query} maxLength={120} placeholder="Name, E-Mail, Event oder Vorgang"/></label><button>Suchen</button>{query&&<Link href={`/unternehmer/archiv?bereich=${category}`}>Zurücksetzen</Link>}</form><h2>{categoryLabel}</h2>{cards.length?<div className="archive-list">{cards}</div>:<div className="empty">{query?"Keine Einträge für diese Suche gefunden.":"Hier sind noch keine gespeicherten Einträge vorhanden."}</div>}<div className="archive-pages">{page>1&&<Link href={archiveUrl(page-1)}>← Vorherige Seite</Link>}<span>Seite {page}</span>{hasNext&&<Link href={archiveUrl(page+1)}>Nächste Seite →</Link>}</div></section>
  </section>
 </main>;
}
