"use client";
import {FormEvent,useState} from "react";
import Link from "next/link";
import "../unternehmer/unternehmer.css";
import "../unternehmer/owner-enhancements.css";
import "./forgot-password.css";

export default function ForgotPassword(){
 const [email,setEmail]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");
  try{const response=await fetch("/api/auth/password-link",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})}),data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||"Anfrage fehlgeschlagen.");setDone(true)}catch(reason){setError(reason instanceof Error?reason.message:"Anfrage fehlgeschlagen.")}finally{setBusy(false)}
 }
 return <main className="ownerlogin forgot-password"><section><p>RESCUEED ALERT</p><h1>Passwort zurücksetzen</h1>{done?<><div className="loginmessage success" role="status">Wenn für diese Adresse ein aktives Konto besteht, wurde ein einmaliger Passwortlink versendet. Bitte auch den Spam-Ordner prüfen.</div><Link className="loginlink" href="/">← Zur Anmeldung</Link></>:<form onSubmit={submit}><label>E-Mail-Adresse<input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label><button disabled={busy}>{busy?"Wird angefordert …":"Passwortlink anfordern"}</button>{error&&<div className="loginmessage" role="alert">{error}</div>}</form>}</section></main>;
}
