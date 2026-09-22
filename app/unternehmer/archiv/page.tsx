import Link from "next/link";
import type {ReactNode} from "react";
import {desc,eq,like,or} from "drizzle-orm";
import {redirect} from "next/navigation";
import {getDb} from "@/db";
import {auditLogs,billingRecords,deletedCustomerArchives,events,legalAcknowledgements,legalDocumentVersions,organizations,retentionActions,users} from "@/db/schema";
import {RescueEdLogo} from "@/components/brand-logo";
import {platformOwner} from "@/lib/session";
import {LogoutButton} from "../actions";
import "../unternehmer.css";
import "../owner-enhancements.css";
import "../dashboard.css";
import "../compact-layout.css";
import "./archive.css";

export const dynamic="force-dynamic";
type Category="kunden"|"rechtstexte"|"bestaetigungen"|"buchungen"|"events"|"audit"|"loeschprotokoll";
const categories:{key:Category;label:string}[]=[
 {key:"kunden",label:"Gelöschte Kunden"},{key:"rechtstexte",label:"Rechtstext-Versionen"},{key:"bestaetigungen",label:"Bestätigungen"},
 {key:"buchungen",label:"Buchungsbelege"},{key:"events",label:"Gespeicherte Events"},{key:"audit",label:"Audit-Verlauf"},{key:"loeschprotokoll",label:"Löschprotokoll"}
];
const pageSize=50;
const date=(value:Date|string|number|null)=>value?new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"–";
const euro=(cents:number)=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(cents/100);
function pretty(value:string){try{return JSON.stringify(JSON.parse(value),null,2)}catch{return "Gespeicherter Nachweis konnte nicht gelesen werden."}}

export default async function ArchivePage({searchParams}:{searchParams:Promise<{bereich?:string;seite?:string;q?:string}>}){
 const owner=await platformOwner();if(!owner)redirect("/unternehmer/login");
 const params=await searchParams,category=categories.find(item=>item.key===params.bereich)?.key??"kunden";
 const parsedPage=Number(params.seite),page=Number.isSafeInteger(parsedPage)&&parsedPage>0?Math.min(parsedPage,10000):1;
 const query=(params.q??"").trim().slice(0,120),search=`%${query}%`,offset=(page-1)*pageSize;
 const db=getDb();let cards:ReactNode[]=[];let hasNext=false;
 if(category==="kunden"){
  const rows=await db.select().from(deletedCustomerArchives).where(query?or(like(deletedCustomerArchives.fullName,search),like(deletedCustomerArchives.email,search),like(deletedCustomerArchives.organizationName,search)):undefined).orderBy(desc(deletedCustomerArchives.deletedAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;cards=rows.slice(0,pageSize).map(row=><article className="archive-entry" key={row.id}><div><b>{row.organizationName} · {row.fullName}</b><small>{row.email} · gelöscht {date(row.deletedAt)}</small><span>Prüfung der Aufbewahrung ab {date(row.retentionReviewAt)}</span></div><details><summary>Gespeicherte Vertrags- und Rechtstextnachweise</summary><pre>{pretty(row.legalSnapshotJson)}</pre></details></article>);
 }else if(category==="rechtstexte"){
  const rows=await db.select().from(legalDocumentVersions).where(query?or(like(legalDocumentVersions.title,search),like(legalDocumentVersions.version,search),like(legalDocumentVersions.documentKey,search)):undefined).orderBy(desc(legalDocumentVersions.publishedAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;cards=rows.slice(0,pageSize).map(row=><article className="archive-entry" key={row.id}><div><b>{row.title} · Version {row.version}</b><small>{row.documentKey} · veröffentlicht {date(row.publishedAt)} · {row.archivedAt?`archiviert ${date(row.archivedAt)}`:"aktuelle Fassung"}</small><span>SHA-256: <code>{row.contentHash}</code></span></div><details><summary>Gespeicherten Wortlaut anzeigen</summary><pre>{row.content}</pre></details></article>);
 }else if(category==="bestaetigungen"){
  const rows=await db.select({id:legalAcknowledgements.id,person:users.fullName,email:users.email,organization:organizations.name,key:legalAcknowledgements.documentKey,version:legalAcknowledgements.documentVersion,hash:legalAcknowledgements.documentHash,type:legalAcknowledgements.acknowledgementType,acceptedAt:legalAcknowledgements.acceptedAt}).from(legalAcknowledgements).innerJoin(users,eq(users.id,legalAcknowledgements.userId)).innerJoin(organizations,eq(organizations.id,legalAcknowledgements.organizationId)).where(query?or(like(users.fullName,search),like(users.email,search),like(organizations.name,search),like(legalAcknowledgements.documentKey,search)):undefined).orderBy(desc(legalAcknowledgements.acceptedAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;cards=rows.slice(0,pageSize).map(row=><article className="archive-entry" key={row.id}><div><b>{row.organization} · {row.person}</b><small>{row.email} · {row.type==="accepted"?"bestätigt":"gelesen"} {date(row.acceptedAt)}</small><span>{row.key.toUpperCase()} · Version {row.version}</span><span>SHA-256: <code>{row.hash}</code></span></div></article>);
 }else if(category==="buchungen"){
  const rows=await db.select().from(billingRecords).where(query?or(like(billingRecords.customerName,search),like(billingRecords.organizationName,search),like(billingRecords.eventName,search),like(billingRecords.email,search)):undefined).orderBy(desc(billingRecords.createdAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;cards=rows.slice(0,pageSize).map(row=><article className="archive-entry" key={row.id}><div><b>{row.organizationName} · {row.eventName}</b><small>Gebucht {date(row.createdAt)} · {euro(row.amountCents)} · {row.helperLimit} Helfer</small><span>{row.recipientName} · {row.street}, {row.postalCode} {row.city} · {row.email}</span><span>Eventdatum {row.eventDate} · Beleg {row.id} · Aufbewahrung bis {date(row.retainUntil)}</span></div></article>);
 }else if(category==="events"){
  const rows=await db.select({id:events.id,name:events.name,organization:organizations.name,eventDate:events.eventDate,endDate:events.endDate,helperLimit:events.helperLimit,priceCents:events.priceCents,status:events.status,createdAt:events.createdAt}).from(events).innerJoin(organizations,eq(organizations.id,events.organizationId)).where(query?or(like(events.name,search),like(organizations.name,search),like(events.id,search)):undefined).orderBy(desc(events.createdAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;cards=rows.slice(0,pageSize).map(row=><article className="archive-entry" key={row.id}><div><b>{row.name} · {row.organization}</b><small>{row.eventDate}{row.endDate&&row.endDate!==row.eventDate?` – ${row.endDate}`:""} · {row.status} · {row.helperLimit} Helfer</small><span>Erstellt {date(row.createdAt)} · {euro(row.priceCents)} · Eventnummer {row.id}</span></div></article>);
 }else if(category==="audit"){
  const rows=await db.select({id:auditLogs.id,action:auditLogs.action,entityType:auditLogs.entityType,entityId:auditLogs.entityId,metadataJson:auditLogs.metadataJson,createdAt:auditLogs.createdAt,actor:users.fullName}).from(auditLogs).leftJoin(users,eq(users.id,auditLogs.actorUserId)).where(query?or(like(auditLogs.action,search),like(auditLogs.entityType,search),like(auditLogs.entityId,search)):undefined).orderBy(desc(auditLogs.createdAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;cards=rows.slice(0,pageSize).map(row=><article className="archive-entry" key={row.id}><div><b>{row.action}</b><small>{date(row.createdAt)} · {row.actor??"System"}</small><span>{row.entityType} · {row.entityId??"–"}</span></div>{row.metadataJson&&<details><summary>Gespeicherte Metadaten</summary><pre>{pretty(row.metadataJson)}</pre></details>}</article>);
 }else{
  const rows=await db.select().from(retentionActions).where(query?or(like(retentionActions.entityType,search),like(retentionActions.action,search)):undefined).orderBy(desc(retentionActions.createdAt)).limit(pageSize+1).offset(offset);
  hasNext=rows.length>pageSize;cards=rows.slice(0,pageSize).map(row=><article className="archive-entry" key={row.id}><div><b>{row.entityType} · {row.action}</b><small>{date(row.createdAt)} · Protokoll bis {date(row.retainUntil)}</small><span>Datensatz-Hash: <code>{row.entityHash}</code></span></div></article>);
 }
 const archiveUrl=(targetPage:number)=>`/unternehmer/archiv?bereich=${category}&seite=${targetPage}${query?`&q=${encodeURIComponent(query)}`:""}`;
 return <main className="owner owner-tabs archive-page"><aside><div className="ownerbrand"><RescueEdLogo className="brand-logo--owner"/><div><b>RescueEd Alert</b><span>Unternehmerbereich</span></div></div><nav aria-label="Unternehmerbereiche"><Link href="/unternehmer#uebersicht">← Übersicht</Link><Link className="selected" href="/unternehmer/archiv">Archiv</Link></nav><div className="asidebottom"><Link className="backtosite" href="/profil">Mein Profil</Link><LogoutButton/></div></aside><section className="ownercontent"><header><div><p>INTERNER SAAS-BEREICH</p><h1>Archiv & Nachweise</h1><span>Lesender Zugriff auf gespeicherte Vertrags-, Buchungs- und Verlaufseinträge.</span></div><div className="operator"><b>{owner.fullName}</b></div></header><div className="archive-notice">Es werden vorhandene Datensätze angezeigt, keine zusätzlichen Kopien angelegt. Gelöschte Events selbst bleiben nicht in der Datenbank; ihre Abschluss-PDF wird beim Löschen per E-Mail bereitgestellt. Passwörter, Sitzungstokens und E-Mail-Inhalte sind hier aus Sicherheitsgründen nicht sichtbar.</div><nav className="archive-categories" aria-label="Archivbereiche">{categories.map(item=><Link key={item.key} className={category===item.key?"active":""} href={`/unternehmer/archiv?bereich=${item.key}`}>{item.label}</Link>)}</nav><section className="area-panel"><form className="archive-search" action="/unternehmer/archiv" method="GET"><input type="hidden" name="bereich" value={category}/><label>Archiv durchsuchen<input name="q" type="search" defaultValue={query} maxLength={120} placeholder="Name, E-Mail, Event oder Vorgang"/></label><button>Suchen</button>{query&&<Link href={`/unternehmer/archiv?bereich=${category}`}>Zurücksetzen</Link>}</form><h2>{categories.find(item=>item.key===category)?.label}</h2>{cards.length?<div className="archive-list">{cards}</div>:<div className="empty">{query?"Keine Einträge für diese Suche gefunden.":"Hier sind noch keine gespeicherten Einträge vorhanden."}</div>}<div className="archive-pages">{page>1&&<Link href={archiveUrl(page-1)}>← Vorherige Seite</Link>}<span>Seite {page}</span>{hasNext&&<Link href={archiveUrl(page+1)}>Nächste Seite →</Link>}</div></section></section></main>;
}
