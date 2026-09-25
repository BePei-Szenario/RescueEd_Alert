import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {legalDocuments} from "@/db/schema";
import {legalDocumentDefaults,type LegalDocumentKey} from "@/lib/legal-documents";
import {legalPdfUrl} from "@/lib/legal-document-file";
import "../legal.css";

export const dynamic="force-dynamic";
export default async function LegalPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params,key=slug as LegalDocumentKey,standard=legalDocumentDefaults[key];
 if(!standard)return <main className="legalpage"><article><h1>Dokument nicht gefunden</h1><a href="/">Zurück</a></article></main>;
 let document:{title:string;version:string;content:string;pdfFileName:string|null;status:string}|undefined;
 try{[document]=await getDb().select({title:legalDocuments.title,version:legalDocuments.version,content:legalDocuments.content,pdfFileName:legalDocuments.pdfFileName,status:legalDocuments.status}).from(legalDocuments).where(eq(legalDocuments.documentKey,key)).limit(1)}catch{}
 const shown=document||{...standard,status:"draft"};
 const pdfFileName="pdfFileName" in shown?shown.pdfFileName:null,pdfUrl=pdfFileName?legalPdfUrl(key):null;
 return <main className="legalpage"><article><a className="legalback" href="/">← Zurück zu RescueEd Alert</a><span className={`legalstatus ${shown.status}`}>{shown.status==="published"?"Veröffentlicht":"Entwurf – rechtlich prüfen"}</span><h1>{shown.title}</h1><p className="legalversion">Version {shown.version}</p>{pdfUrl&&<section className="legalpdf"><div><b>Maßgebliche PDF-Fassung</b><a href={pdfUrl} target="_blank" rel="noreferrer">PDF in neuem Fenster öffnen</a></div><iframe src={pdfUrl} title={`${shown.title}, Version ${shown.version}`}/></section>}<div className="legalcontent"><h2>{pdfUrl?"Barrierefreier Text":"Dokumentinhalt"}</h2>{shown.content.split("\n").map((line,index)=>line?<p key={index}>{line}</p>:<br key={index}/>)}</div></article></main>}
