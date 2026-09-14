"use client";
import {useMemo,useState} from "react";
import {BellRing,Check,ChevronDown,Clock3,Copy,Plus,QrCode,Radio,ShieldCheck,Smartphone,Users,X} from "lucide-react";

type Helper={id:number;name:string;unit:string;confirmed:boolean};
const seed:Helper[]=[
{id:1,name:"Anna Becker",unit:"Fußtrupp 1",confirmed:true},{id:2,name:"Paul König",unit:"Fußtrupp 1",confirmed:true},
{id:3,name:"Max Mustermann",unit:"Fußtrupp 2",confirmed:false},{id:4,name:"Lisa Weber",unit:"Fußtrupp 2",confirmed:false},
{id:5,name:"Tom Schmidt",unit:"RTW 1",confirmed:true},{id:6,name:"Sarah König",unit:"RTW 1",confirmed:true},
{id:7,name:"Julia Schmidt",unit:"",confirmed:false},{id:8,name:"Peter Müller",unit:"",confirmed:false}];

export default function Home(){
 const [helpers,setHelpers]=useState(seed),[units,setUnits]=useState(["Fußtrupp 1","Fußtrupp 2","RTW 1","UHS"]);
 const [view,setView]=useState<"admin"|"helper">("admin"),[dialog,setDialog]=useState<"qr"|"unit"|"alert"|null>(null);
 const [selected,setSelected]=useState(["Fußtrupp 2"]),[message,setMessage]=useState("Bühne Nord – bitte Funk beachten.");
 const [sent,setSent]=useState(false),[confirmed,setConfirmed]=useState(false),[newUnit,setNewUnit]=useState("");
 const grouped=useMemo(()=>units.map(unit=>({unit,people:helpers.filter(h=>h.unit===unit)})),[helpers,units]);
 const recipients=helpers.filter(h=>selected.includes(h.unit)), assigned=helpers.filter(h=>h.unit).length;
 const assign=(id:number,unit:string)=>setHelpers(x=>x.map(h=>h.id===id?{...h,unit}:h));
 const confirm=()=>{setConfirmed(true);setHelpers(x=>x.map(h=>h.name==="Max Mustermann"?{...h,confirmed:true}:h))};
 if(view==="helper")return <Helper sent={sent} confirmed={confirmed} message={message} confirm={confirm} back={()=>setView("admin")}/>;
 return <main className="min-h-screen bg-[#f3f6fa] text-[#10223d]">
  <header className="bg-[#071a33] text-white"><div className="mx-auto flex max-w-[1450px] items-center justify-between px-5 py-4 lg:px-8">
   <Brand/><button className="ghost" onClick={()=>setView("helper")}><Smartphone size={17}/> Helferansicht</button>
  </div></header>
  <section className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-[1450px] flex-col justify-between gap-5 px-5 py-6 lg:flex-row lg:items-center lg:px-8">
   <div><p className="mb-2 flex items-center gap-2 text-sm text-slate-500"><i className="size-2 rounded-full bg-emerald-500"/>Dienst aktiv · 14. September 2026</p><h1 className="text-2xl font-extrabold sm:text-3xl">Stadtfest Musterstadt</h1><p className="mt-2 text-sm text-slate-500">{helpers.length} Helfer angemeldet · {assigned} eingeteilt · {helpers.length-assigned} offen</p></div>
   <div className="flex flex-wrap gap-2"><button className="secondary" onClick={()=>setDialog("qr")}><QrCode size={18}/> QR-Code</button><button className="secondary" onClick={()=>setDialog("unit")}><Plus size={18}/> Tätigkeit</button><button className="danger" onClick={()=>setDialog("alert")}><BellRing size={19}/> Alarmieren</button></div>
  </div></section>
  <div className="mx-auto grid max-w-[1450px] gap-6 px-5 py-6 lg:grid-cols-[1.15fr_.85fr] lg:px-8">
   <section className="card overflow-hidden"><Head title="Helfer" sub="Aktuelle Anwesenheit und Einteilung" count={helpers.length}/><div className="divide-y divide-slate-100">
    {helpers.map(h=><div key={h.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_210px] sm:items-center"><div className="flex items-center gap-3"><div className="avatar">{h.name.split(" ").map(x=>x[0]).join("")}</div><div><b className="text-slate-900">{h.name}</b><p className="text-xs text-slate-500">● angemeldet</p></div></div><label className="select"><select value={h.unit} onChange={e=>assign(h.id,e.target.value)}><option value="">Nicht eingeteilt</option>{units.map(u=><option key={u}>{u}</option>)}</select><ChevronDown size={16}/></label></div>)}
   </div></section>
   <div className="space-y-6">
    {sent&&<section className="overflow-hidden rounded-2xl border border-red-200 bg-white"><div className="flex justify-between bg-red-50 p-4"><div><b className="flex gap-2 text-red-700"><BellRing size={18}/> Aktiver Alarm</b><p className="text-sm text-red-600">{selected.join(", ")} · gerade eben</p></div><span className="pill red">{recipients.filter(r=>r.confirmed).length}/{recipients.length}</span></div><div className="p-4">{message&&<p className="mb-2 rounded-lg bg-slate-50 p-3 text-sm">{message}</p>}{recipients.map(r=><p key={r.id} className="flex justify-between border-b border-slate-100 py-3 last:border-0"><b>{r.name}</b>{r.confirmed?<span className="ok"><Check size={16}/> bestätigt</span>:<span className="wait"><Clock3 size={15}/> ausstehend</span>}</p>)}</div></section>}
    <section className="card"><Head title="Tätigkeiten" sub={units.length+" Bereiche angelegt"}/><div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{grouped.map(({unit,people})=><article className="unit" key={unit}><div className="flex justify-between"><Icon/><small>{people.length} Helfer</small></div><h3>{unit}</h3><div className="min-h-11">{people.length?people.map(p=><p key={p.id}>{p.name}</p>):<p className="muted">Noch nicht besetzt</p>}</div><button disabled={!people.length} onClick={()=>{setSelected([unit]);setDialog("alert")}}><BellRing size={15}/> Alarmieren</button></article>)}</div></section>
   </div>
  </div>
  {dialog&&<div className="backdrop" onMouseDown={()=>setDialog(null)}><section className="modal" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={()=>setDialog(null)}><X/></button>
   {dialog==="qr"&&<><Icon big qr/><h2>Helfer einchecken</h2><p className="copy">QR-Code zeigen oder Link teilen. Er erlaubt ausschließlich die Anmeldung zu diesem Dienst.</p><img className="qr" alt="QR-Code für den Check-in" src={"https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&data="+encodeURIComponent("https://rescueed-alert.example/join/A7K9X2")}/><button className="link" onClick={()=>navigator.clipboard?.writeText("https://rescueed-alert.example/join/A7K9X2")}><code>/join/A7K9X2</code><Copy size={17}/></button></>}
   {dialog==="unit"&&<><Icon big/><h2>Tätigkeit hinzufügen</h2><p className="copy">Lege einen Bereich oder eine Einheit für diesen Dienst an.</p><label className="field">Bezeichnung<input autoFocus value={newUnit} onChange={e=>setNewUnit(e.target.value)} placeholder="z. B. KTW 1"/></label><button className="primary full" onClick={()=>{if(newUnit.trim())setUnits(x=>[...x,newUnit.trim()]);setDialog(null);setNewUnit("")}}>Tätigkeit anlegen</button></>}
   {dialog==="alert"&&<><div className="alarmicon"><BellRing/></div><h2>Alarm senden</h2><p className="copy">Wähle eine oder mehrere Tätigkeiten. Alle aktuell eingeteilten Helfer werden alarmiert.</p><div className="checks">{units.map(u=><label key={u}><input type="checkbox" checked={selected.includes(u)} onChange={()=>setSelected(x=>x.includes(u)?x.filter(v=>v!==u):[...x,u])}/><b>{u}</b><span>{helpers.filter(h=>h.unit===u).length}</span></label>)}</div><label className="field">Kurze Meldung <em>optional</em><textarea maxLength={150} value={message} onChange={e=>setMessage(e.target.value)}/></label><p className="counter">{recipients.length} Empfänger <span>{message.length}/150</span></p><button className="danger full" disabled={!recipients.length} onClick={()=>{setSent(true);setConfirmed(false);setHelpers(x=>x.map(h=>selected.includes(h.unit)?{...h,confirmed:false}:h));setDialog(null)}}><BellRing size={19}/> ALARM SENDEN</button></>}
  </section></div>}
 </main>
}
function Brand(){return <div className="flex items-center gap-3"><div className="logo"><Radio size={22}/></div><div><b>RescueEd Alert</b><p>Einchecken · Einteilen · Alarmieren</p></div></div>}
function Head({title,sub,count}:{title:string;sub:string;count?:number}){return <header className="head"><div><h2>{title}</h2><p>{sub}</p></div>{count!==undefined&&<span className="pill"><Users size={15}/>{count}</span>}</header>}
function Icon({big,qr}:{big?:boolean;qr?:boolean}){return <div className={big?"bigicon":"icon"}>{qr?<QrCode/>:<ShieldCheck size={big?22:18}/>}</div>}
function Helper({sent,confirmed,message,confirm,back}:{sent:boolean;confirmed:boolean;message:string;confirm:()=>void;back:()=>void}){return <main className="min-h-screen bg-[#eaf0f7]"><div className="mx-auto min-h-screen max-w-md bg-white shadow-2xl"><header className="flex justify-between bg-[#071a33] p-4 text-white"><Brand/><button onClick={back} className="text-xs text-blue-200">Admin</button></header><div className="p-5"><p className="text-sm text-slate-500">Stadtfest Musterstadt</p><h1 className="mb-6 mt-1 text-2xl font-extrabold">Hallo, Max.</h1>{sent?<section className={"helperalert "+(confirmed?"confirmed":"")}><div className="alerttop">{confirmed?<Check size={32}/>:<BellRing size={32}/>}<small>{confirmed?"Bestätigt":"Alarm"}</small><h2>Fußtrupp 2</h2></div><div className="p-6 text-center"><b className="text-lg">{message||"Bitte Funk beachten."}</b>{confirmed?<p className="done">Alarm bestätigt · gerade eben</p>:<button className="confirm" onClick={confirm}><Check/> ALARM BESTÄTIGEN</button>}<p className="mt-4 text-sm text-slate-500">Bitte Funk beachten.</p></div></section>:<><section className="card p-5"><small className="label">Deine Einteilung</small><div className="mt-3 flex items-center gap-3"><Icon/><div><b className="text-lg">Fußtrupp 2</b><p className="text-sm text-emerald-600">Einsatzbereit</p></div></div></section><section className="mt-4 rounded-2xl bg-blue-50 p-5 text-blue-950"><b>Du bist angemeldet.</b><p className="mt-1 text-sm text-blue-800/70">Lass diese Seite geöffnet. Alarmierungen erscheinen hier automatisch.</p></section></>}</div></div></main>}
