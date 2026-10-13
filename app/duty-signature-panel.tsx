"use client";

import {useEffect,useState} from "react";
import {Check,MailCheck} from "lucide-react";
import "./duty-plan.css";

export function DutySignaturePanel({eventId}:{eventId:string}){
 const [signature,setSignature]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState(""),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false);
 const base=`/api/events/${encodeURIComponent(eventId)}/duty-plan/settings`;
 useEffect(()=>{const controller=new AbortController();fetch(base,{cache:"no-store",signal:controller.signal}).then(async response=>{const body=await response.json() as {error?:string;signature?:string};if(!response.ok)throw new Error(body.error||"Signatur konnte nicht geladen werden.");setSignature(body.signature||"");setLoading(false)}).catch(reason=>{if(controller.signal.aborted)return;setError(reason instanceof Error?reason.message:"Signatur konnte nicht geladen werden.");setLoading(false)});return()=>controller.abort()},[base]);
 async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");setSaved(false);try{const response=await fetch(base,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({signature})}),body=await response.json() as {error?:string;signature?:string};if(!response.ok)throw new Error(body.error||"Signatur konnte nicht gespeichert werden.");setSignature(body.signature||signature);setSaved(true)}catch(reason){setError(reason instanceof Error?reason.message:"Signatur konnte nicht gespeichert werden.")}finally{setBusy(false)}}
 return <section className="duty-plan" aria-labelledby="duty-signature-title">
  <div className="duty-plan-heading"><div><h2 id="duty-signature-title">E-Mail-Signatur</h2><p>Deine Signatur gilt für die Dienstplan-E-Mails aller Events deiner Organisation.</p></div></div>
  {error&&<p className="duty-message error" role="alert">{error}</p>}
  {saved&&<p className="duty-message success" role="status"><Check/> E-Mail-Signatur wurde gespeichert.</p>}
  {loading?<p role="status">Signatur wird geladen …</p>:<form className="card duty-tool" onSubmit={save}>
   <div className="duty-tool-title"><MailCheck/><div><h3>Eigene Signatur</h3><p>Versand über die Standard-noreply-Adresse von RescueEd Alert.</p></div></div>
   <label>Signatur<textarea required maxLength={4000} rows={8} value={signature} onChange={event=>{setSignature(event.target.value);setSaved(false)}} placeholder="Ihre individuelle Signatur" aria-describedby="signature-hint"/></label>
   <p id="signature-hint">Pflichtfeld, nur Klartext. RescueEd ergänzt automatisch: „Diese E-Mail wird im Namen von [Kunde] über RescueEd Alert versendet.“</p>
   <button className="primary" disabled={busy}>{busy?"Wird gespeichert …":"Signatur speichern"}</button>
  </form>}
 </section>;
}
