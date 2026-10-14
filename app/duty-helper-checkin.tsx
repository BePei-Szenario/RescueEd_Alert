"use client";
import {useEffect,useState} from "react";

type Booking={id:string;firstName:string;lastName:string;title:string;startAt:number;endAt:number};
type Options={usesDutyPlan:boolean;bookings:Booking[]};
const date=(value:number)=>new Intl.DateTimeFormat("de-DE",{timeZone:"Europe/Berlin",dateStyle:"short",timeStyle:"short"}).format(new Date(value));

export function DutyHelperCheckin({eventId,onLegacy,onDone}:{eventId:string;onLegacy:()=>void;onDone:()=>void}){
 const [options,setOptions]=useState<Options|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[code,setCode]=useState(""),[bookingId,setBookingId]=useState(""),[mode,setMode]=useState<"code"|"list">("code");
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/events/${encodeURIComponent(eventId)}/helpers`,{cache:"no-store",signal:controller.signal}).then(async response=>{const result=await response.json() as Options&{error?:string};if(!response.ok)throw new Error(result.error||"Dienstplan konnte nicht geladen werden.");setOptions(result)}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Laden fehlgeschlagen.")});
  return()=>controller.abort();
 },[eventId]);
 async function submit(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError("");
  try{
   const response=await fetch(`/api/events/${encodeURIComponent(eventId)}/helpers`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(mode==="code"?{dutyCode:code}:{bookingId})}),result=await response.json() as {error?:string};
   if(!response.ok)throw new Error(result.error||"Einbuchen fehlgeschlagen.");
   onDone();
  }catch(reason){setError(reason instanceof Error?reason.message:"Einbuchen fehlgeschlagen.")}finally{setBusy(false)}
 }
 if(!options)return <><h2>Helfer einbuchen</h2><p role={error?"alert":"status"}>{error||"Dienstplan wird geladen …"}</p></>;
 if(!options.usesDutyPlan)return <><h2>Helfer anlegen</h2><p className="copy">Helfer kann nicht alarmiert werden, er wird nur in der Anwesenheit angezeigt und protokolliert!</p><button className="primary modal-acknowledge" onClick={onLegacy}>OK</button></>;
 return <form onSubmit={submit}>
  <h2>Helfer aus Dienstplan einbuchen</h2>
  <p className="copy">Die Person wird mit der aktuellen Uhrzeit als anwesend erfasst. Für Alarmierungen muss sie anschließend ihr Handy per QR-Scan und Dienstcode verbinden.</p>
  <label className="field">Einbuchen über<select value={mode} disabled={busy} onChange={event=>{setMode(event.target.value as "code"|"list");setError("")}}><option value="code">Persönlichen Dienstcode</option><option value="list">Auswahl aus dem Dienstplan</option></select></label>
  {mode==="code"?<label className="field">Dienstcode<input autoFocus inputMode="numeric" autoComplete="off" maxLength={12} value={code} onChange={event=>setCode(event.target.value)} placeholder="1234 5678" disabled={busy}/></label>:<label className="field">Person und Dienst<select value={bookingId} onChange={event=>setBookingId(event.target.value)} disabled={busy} required><option value="">Bitte auswählen</option>{options.bookings.map(booking=><option key={booking.id} value={booking.id}>{booking.lastName}, {booking.firstName} · {booking.title} · {date(booking.startAt)} – {date(booking.endAt)}</option>)}</select>{!options.bookings.length&&<span>Keine noch nicht eingebuchten Dienste vorhanden.</span>}</label>}
  {error&&<p className="copy modal-error" role="alert">{error}</p>}
  <button className="primary full" disabled={busy||(mode==="code"?code.replace(/\D/g,"").length!==8:!bookingId)}>{busy?"Wird eingebucht …":"Als anwesend übernehmen"}</button>
 </form>;
}
