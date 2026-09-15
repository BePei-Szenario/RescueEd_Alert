// @ts-nocheck -- Response.json is typed as unknown by the current Vinext DOM shim.
"use client";
import {FormEvent,useState} from "react";
import {KeyRound,ShieldCheck} from "lucide-react";
import {RescueEdLogo} from "@/components/brand-logo";
import "../unternehmer.css";
import "../owner-enhancements.css";
import "../owner-nav.css";

export default function UnternehmerLogin(){
 const [step,setStep]=useState<"login"|"mfa">("login"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[code,setCode]=useState(""),[challenge,setChallenge]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const url=step==="login"?"/api/auth/login":"/api/auth/mfa/verify",body=step==="login"?{email,password,area:"unternehmer"}:{challenge,code};const res=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),data=await res.json();if(!res.ok)throw new Error(data.error||"Anmeldung fehlgeschlagen.");if(step==="login"){setPassword("");setChallenge(data.challenge);setStep("mfa");if(data.previewCode)setMessage(`Lokaler Sicherheitscode: ${data.previewCode}`)}else location.href="/unternehmer"}catch(err){setMessage(err instanceof Error?err.message:"Anmeldung fehlgeschlagen.")}finally{setBusy(false)}}
 return <main className="ownerlogin"><section><div className="ownerbrand loginbrand"><RescueEdLogo className="brand-logo--owner"/><div><b>RescueEd Alert</b><span>Unternehmerbereich</span></div></div><div className="loginshield"><ShieldCheck/></div><p>GESCHÜTZTER BEREICH</p><h1>{step==="login"?"Unternehmer-Login":"Sicherheitscode"}</h1><span>{step==="login"?"Anmeldung ausschließlich für die Plattformverwaltung.":"Geben Sie den sechsstelligen Sicherheitscode aus der E-Mail ein."}</span><form onSubmit={submit}>{step==="login"?<><label>E-Mail<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Passwort<input type="password" autoComplete="current-password" minLength={12} required value={password} onChange={e=>setPassword(e.target.value)}/></label></>:<label>Sicherheitscode<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))}/></label>}<button disabled={busy}>{busy?"Bitte warten …":step==="login"?"Sicher anmelden":"Sicherheitscode bestätigen"}</button></form>{message&&<div className="loginmessage" role="status">{message}</div>}<a href="/">← Zur RescueEd Alert SaaS</a></section></main>
}
