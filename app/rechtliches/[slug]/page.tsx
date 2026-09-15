import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {legalDocuments} from "@/db/schema";
import {legalDocumentDefaults,type LegalDocumentKey} from "@/lib/legal-documents";
import "../legal.css";

export const dynamic="force-dynamic";
export default async function LegalPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params,key=slug as LegalDocumentKey,standard=legalDocumentDefaults[key];
 if(!standard)return <main className="legalpage"><article><h1>Dokument nicht gefunden</h1><a href="/">Zurück</a></article></main>;
 let document:{title:string;version:string;content:string;status:string}|undefined;
 try{[document]=await getDb().select({title:legalDocuments.title,version:legalDocuments.version,content:legalDocuments.content,status:legalDocuments.status}).from(legalDocuments).where(eq(legalDocuments.documentKey,key)).limit(1)}catch{}
 const shown=document||{...standard,status:"draft"};
 return <main className="legalpage"><article><a className="legalback" href="/">← Zurück zu RescueEd Alert</a><span className={`legalstatus ${shown.status}`}>{shown.status==="published"?"Veröffentlicht":"Entwurf – rechtlich prüfen"}</span><h1>{shown.title}</h1><p className="legalversion">Version {shown.version}</p><div className="legalcontent">{shown.content.split("\n").map((line,index)=>line?<p key={index}>{line}</p>:<br key={index}/>)}</div></article></main>}
