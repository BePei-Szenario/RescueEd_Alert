"use client";
import {FormEvent,useEffect,useState} from "react";
import {ArrowRight,CalendarDays,Check,FileText,LogOut,Plus,Users} from "lucide-react";
import {RescueEdLogo} from "@/components/brand-logo";
import "./flows.css";
import "./order-confirmation.css";

type EventRow={id:string;name:string;eventDate:string;helperLimit:number;priceCents:number;status:string};
type BillingProfile={recipientName:string;street:string;postalCode:string;city:string;billingEmail:string};
type EventOrder=BillingProfile&{name:string;eventDate:string;startTime:string;endTime:string;helperLimit:number};

function Brand(){return <div className="flex items-center gap-3"><RescueEdLogo/><div><b>RescueEd Alert</b><p>Einchecken · Einteilen · Alarmieren</p></div></div>}

export function ConnectedEvents({open,create,logout}:{open:(eventId:string)=>void;create:()=>void;logout:()=>void}){
 const [events,setEvents]=useState<EventRow[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch("/api/events").then(async r=>{if(r.status===401){logout();return}const d=await r.json() as {events?:EventRow[]};setEvents(d.events||[])}).finally(()=>setLoading(false))},[logout]);
 return <main className="portal"><header><Brand/><button className="portal-logout" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});logout()}}><LogOut size={17}/> Abmelden</button></header><section className="portalbody"><div className="portal-title"><div><p>EVENTVERWALTUNG</p><h1>Deine Events</h1><span>Wähle ein Event aus oder erstelle einen neuen Sanitätsdienst.</span></div><button onClick={create}><Plus/> Neues Event</button></div><div className="eventgrid">{loading?<div className="newevent">Events werden geladen …</div>:events.map(event=><button className="eventcard" key={event.id} onClick={()=>open(event.id)}><div className="eventdate"><b>{new Date(event.eventDate+"T12:00:00").getDate()}</b><span>{new Intl.DateTimeFormat("de-DE",{month:"short"}).format(new Date(event.eventDate+"T12:00:00")).toUpperCase()}</span></div><div><span className="activebadge">{event.status==="active"?"Aktiv":event.status}</span><h2>{event.name}</h2><p><Users size={16}/> bis {event.helperLimit} Helfer · {(event.priceCents/100).toFixed(2).replace(".",",")} €</p></div><ArrowRight className="eventarrow"/></button>)}<button className="newevent" onClick={create}><Plus/><b>Neues Event erstellen</b><span>Sanitätsdienst anlegen und Helfer einladen</span></button></div></section></main>
}

export function ConnectedCreateEvent({back,done}:{back:()=>void;done:()=>void}){
 const [count,setCount]=useState(20),[error,setError]=useState(""),[busy,setBusy]=useState(false),[loadingProfile,setLoadingProfile]=useState(true),[confirmed,setConfirmed]=useState(false),[pendingOrder,setPendingOrder]=useState<EventOrder|null>(null);
 const [billing,setBilling]=useState<BillingProfile>({recipientName:"",street:"",postalCode:"",city:"",billingEmail:""});
 const priceCents=count<=20?599:999,price=(priceCents/100).toFixed(2).replace(".",",")+" €",netCents=Math.round(priceCents/1.19),vatCents=priceCents-netCents;

 useEffect(()=>{
  let active=true;
  fetch("/api/auth/me").then(async r=>{if(!r.ok)throw new Error();const d=await r.json() as {email:string;organization?:{name:string;billingEmail:string;billingStreet:string|null;billingHouseNumber:string|null;billingPostalCode:string|null;billingCity:string|null}|null};if(active)setBilling({recipientName:d.organization?.name||"",street:[d.organization?.billingStreet,d.organization?.billingHouseNumber].filter(Boolean).join(" "),postalCode:d.organization?.billingPostalCode||"",city:d.organization?.billingCity||"",billingEmail:d.organization?.billingEmail||d.email||""})}).catch(()=>{if(active)setError("Die gespeicherten Rechnungsdaten konnten nicht geladen werden.")}).finally(()=>{if(active)setLoadingProfile(false)});
  return()=>{active=false};
 },[]);

 function updateBilling(key:keyof BillingProfile,value:string){setBilling(current=>({...current,[key]:value}))}

 function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError("");
  const f=new FormData(e.currentTarget);
  setPendingOrder({name:String(f.get("name")||"").trim(),eventDate:String(f.get("eventDate")||""),startTime:String(f.get("startTime")||""),endTime:String(f.get("endTime")||""),helperLimit:count,...billing});
 }

 async function confirmOrder(){
  if(!pendingOrder)return;
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/events",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(pendingOrder)}),d=await r.json() as {error?:string};
   if(!r.ok){setError(d.error||"Event konnte nicht erstellt werden.");setPendingOrder(null);return}
   setPendingOrder(null);setConfirmed(true);
  }catch{setError("Event konnte nicht erstellt werden. Bitte versuche es erneut.")}finally{setBusy(false)}
 }

 return <main className="formpage"><header><Brand/><button onClick={back}>Abbrechen</button></header><section className="createwrap"><div className="createhead"><p>NEUES EVENT</p><h1>Sanitätsdienst erstellen</h1><span>Beim Speichern wird eine Rechnungsanforderung an RescueEd übermittelt.</span></div><form className="createform" onSubmit={submit}><div><section><h2><CalendarDays/> Eventdetails</h2><label>Name des Events<input name="name" required/></label><div className="threecol"><label>Datum<input name="eventDate" required type="date"/></label><label>Beginn<input name="startTime" required type="time"/></label><label>Ende<input name="endTime" required type="time"/></label></div><label>Voraussichtliche Helferzahl<input required type="number" min="1" value={count} onChange={e=>setCount(Math.max(1,Number(e.target.value)))}/></label></section><section><h2><FileText/> Rechnungsdaten</h2>{loadingProfile&&<p className="profilehint">Gespeicherte Rechnungsdaten werden geladen …</p>}<label>Organisation / Rechnungsempfänger<input name="recipientName" required value={billing.recipientName} onChange={e=>updateBilling("recipientName",e.target.value)}/></label><div className="twocol"><label>Straße und Hausnummer<input name="street" required value={billing.street} onChange={e=>updateBilling("street",e.target.value)}/></label><label>PLZ<input name="postalCode" required value={billing.postalCode} onChange={e=>updateBilling("postalCode",e.target.value)}/></label></div><label>Ort<input name="city" required value={billing.city} onChange={e=>updateBilling("city",e.target.value)}/></label><label>Rechnungs-E-Mail<input name="billingEmail" required type="email" value={billing.billingEmail} onChange={e=>updateBilling("billingEmail",e.target.value)}/></label><p className="profilehint">Aus deiner Registrierung übernommen. Änderungen gelten nur für diese Bestellung.</p>{error&&<p className="autherror" role="alert">{error}</p>}</section></div><aside className="pricebox"><div><span>Event bis {count} Helfer</span><b>{price}</b></div><p>Einmaliger Bruttopreis pro Event inklusive 19 % MwSt. · Rechnung wird durch RescueEd erstellt.</p><div className="pricebreakdown"><span>Netto</span><b>{(netCents/100).toFixed(2).replace(".",",")} €</b><span>19 % MwSt.</span><b>{(vatCents/100).toFixed(2).replace(".",",")} €</b></div><ul><li><Check/> QR-Check-in</li><li><Check/> Einteilung & Alarmierung</li><li><Check/> App-Anbindung vorbereitet</li></ul><button disabled={busy||loadingProfile} type="submit">{`Zahlungspflichtig erstellen · ${price}`}</button><small>Abrechnung am Monatsende per Rechnung. Es erfolgt keine automatische Abbuchung.</small></aside></form></section>{pendingOrder&&<div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog order-review-dialog" role="dialog" aria-modal="true" aria-labelledby="order-review-title"><h2 id="order-review-title">Bestellung bestätigen</h2><p className="order-event-name">{pendingOrder.name}</p><p>Event anlegen und zahlungspflichtig bestellen?</p><div className="confirmation-actions"><button className="confirmation-cancel" type="button" disabled={busy} onClick={()=>setPendingOrder(null)}>Zurück</button><button type="button" disabled={busy} onClick={confirmOrder}>{busy?"Wird bestellt …":`Ja, zahlungspflichtig bestellen · ${price}`}</button></div></section></div>}{confirmed&&<div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="order-confirmation-title"><div className="confirmation-icon"><Check/></div><h2 id="order-confirmation-title">Vielen Dank für Ihre Bestellung!</h2><p>Wir haben Ihre Bestellung erhalten und bearbeiten diese so schnell wie möglich. Eine Bestätigung mit allen Details wurde soeben an Ihre E-Mail-Adresse gesendet.</p><button autoFocus onClick={done}>OK</button></section></div>}</main>
}
