"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {RescueEdLogo} from "@/components/brand-logo";
import "./review.css";

type Document={id:string;documentKey:string;title:string;version:string;content:string;acknowledgementType:"read"|"accepted"};
type Review={required:boolean;available:boolean;canConfirm:boolean;documents:Document[]};

export default function LegalUpdatePage(){
 const [review,setReview]=useState<Review|null>(null),[opened,setOpened]=useState<string[]>([]),[checked,setChecked]=useState<string[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{fetch("/api/legal/reconfirmation",{cache:"no-store"}).then(async response=>{const data=await response.json() as Review&{error?:string};if(!response.ok)throw new Error(data.error||"Rechtstexte konnten nicht geladen werden.");setReview(data)}).catch(reason=>setError(reason instanceof Error?reason.message:"Rechtstexte konnten nicht geladen werden."))},[]);
 async function confirm(){
  setError("");setBusy(true);
  try{
   const response=await fetch("/api/legal/reconfirmation",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({acceptedDocumentVersionIds:checked})}),data=await response.json() as {error?:string};
   if(!response.ok)throw new Error(data.error||"Bestätigung fehlgeschlagen.");
   location.assign("/");
  }catch(reason){setError(reason instanceof Error?reason.message:"Bestätigung fehlgeschlagen.");setBusy(false)}
 }
 return <main className="legal-update-page"><header><RescueEdLogo/><b>RescueEd Alert</b><Link href="/">← Zu meinen Events</Link></header><section className="legal-update-card"><p className="legal-update-kicker">RECHTLICHE FASSUNGEN</p><h1>Aktuelle Rechtstexte</h1><p>Laufende Events bleiben erreichbar. Vor einem neuen Event muss das Hauptkonto die aktuellen Fassungen bestätigen.</p>{!review&&!error&&<p>Fassungen werden geladen …</p>}{error&&<p className="legal-update-error" role="alert">{error}</p>}{review&&!review.available&&<p>Die Rechtstexte sind noch nicht vollständig veröffentlicht. Bitte später erneut prüfen.</p>}{review?.available&&!review.required&&<p>Alle aktuellen Fassungen sind bereits bestätigt.</p>}{review?.required&&!review.canConfirm&&<p>Bitte das Hauptkonto Ihrer Organisation bitten, die aktuellen Fassungen zu bestätigen.</p>}{review?.required&&review.canConfirm&&<><div className="legal-update-documents">{review.documents.map(document=><article key={document.id}><details onToggle={event=>{if(event.currentTarget.open)setOpened(items=>items.includes(document.id)?items:[...items,document.id])}}><summary>{document.title} · Version {document.version}</summary><div className="legal-update-content">{document.content}</div></details><label><input type="checkbox" disabled={!opened.includes(document.id)||busy} checked={checked.includes(document.id)} onChange={event=>setChecked(items=>event.target.checked?[...items,document.id]:items.filter(item=>item!==document.id))}/><span>{document.acknowledgementType==="read"?`Ich habe ${document.title} gelesen.`:`Ich habe ${document.title} gelesen und akzeptiere diese Fassung.`}</span></label></article>)}</div><button disabled={busy||checked.length!==review.documents.length} onClick={confirm}>{busy?"Wird gespeichert …":"Alle Fassungen bestätigen"}</button></>}<Link className="legal-update-back" href="/">Laufendes Event fortsetzen</Link></section></main>;
}
