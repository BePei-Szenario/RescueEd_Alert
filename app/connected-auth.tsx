"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ArrowRight,Building2,Check,KeyRound,LockKeyhole,Mail,MapPin,Users} from "lucide-react";
import {RescueEdLogo} from "@/components/brand-logo";
import {PasswordField} from "@/components/password-field";
import {organizationTypes,organizationTypeLabels} from "@/lib/organization-type";
import "./flows.css";
import "./connected-auth.css";

function Shell({back,title,copy,children,wide=false}:{back:()=>void;title:string;copy:string;children:React.ReactNode;wide?:boolean}){return <main className="loginpage"><button className="backhome" onClick={back}>← Zurück</button><section className={`loginbox ${wide?"registerbox":""}`}><div className="loginbrand"><RescueEdLogo className="brand-logo--auth"/><h1>RescueEd Alert</h1><p>Sichere Alarmierung für Ihren Abstellungsdienst</p></div><div className="loginform"><h2>{title}</h2><p>{copy}</p>{children}</div></section></main>}
function Field({label,icon,children}:{label:string;icon:React.ReactNode;children:React.ReactNode}){return <label>{label}<div>{icon}{children}</div></label>}

export function ConnectedRegister({back}:{back:()=>void;submit:()=>void}){
 type Document={id:string;documentKey:string;title:string;version:string;content:string;contentHash:string};
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[previewUrl,setPreviewUrl]=useState(""),[documents,setDocuments]=useState<Document[]>([]),[opened,setOpened]=useState<string[]>([]),[accepted,setAccepted]=useState<string[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;fetch("/api/register/legal",{cache:"no-store"}).then(async response=>{const data=await response.json() as {documents?:Document[];error?:string};if(live){if(response.ok)setDocuments(data.documents||[]);else setError(data.error||"Rechtstexte sind momentan nicht verfügbar.");}}).catch(()=>{if(live)setError("Rechtstexte konnten nicht geladen werden.")}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 const all=documents.length===4&&documents.every(document=>accepted.includes(document.id));
 async function register(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError("");const f=new FormData(e.currentTarget);
  const response=await fetch("/api/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({organization:f.get("organization"),organizationType:f.get("organizationType"),contactName:f.get("contactName"),street:f.get("street"),houseNumber:f.get("houseNumber"),postalCode:f.get("postalCode"),city:f.get("city"),email:f.get("email"),acceptedDocumentVersionIds:accepted})});
  const data=await response.json() as {error?:string;previewUrl?:string};setBusy(false);if(!response.ok){setError(data.error||"Registrierung fehlgeschlagen.");return}setPreviewUrl(data.previewUrl||"");setDone(true);
 }
 if(done)return <Shell back={back} wide title="Registrierungslink versendet" copy="Die Anfrage ist vorgemerkt. Das Kundenkonto wird erst angelegt, wenn über den Link ein Passwort gesetzt wurde."><div className="registration-success"><div><Check/></div><b>Bitte E-Mail-Postfach prüfen</b><p>Der Link ist 24 Stunden gültig und kann nur einmal verwendet werden.</p>{previewUrl&&<a href={previewUrl}>Lokalen Registrierungslink öffnen <ArrowRight size={17}/></a>}</div><button className="textlink" onClick={back}>Zur Anmeldung</button></Shell>;
 return <Shell back={back} wide title="Konto erstellen" copy="Unternehmensdaten eintragen und die Registrierung per E-Mail-Link abschließen."><form className="authform registrationform" onSubmit={register}>
  <Field label="Organisation" icon={<Building2/>}><input name="organization" autoComplete="organization" required/></Field>
  <Field label="Organisationsart" icon={<Building2/>}><select name="organizationType" defaultValue="" required><option value="" disabled>Bitte auswählen</option>{organizationTypes.map(type=><option key={type} value={type}>{organizationTypeLabels[type]}</option>)}</select></Field>
  <Field label="Ansprechpartner" icon={<Users/>}><input name="contactName" autoComplete="name" required/></Field>
  <div className="registration-row"><Field label="Straße" icon={<MapPin/>}><input name="street" autoComplete="address-line1" required/></Field><Field label="Hausnummer" icon={<MapPin/>}><input name="houseNumber" required/></Field></div>
  <div className="registration-row location"><Field label="PLZ" icon={<MapPin/>}><input name="postalCode" autoComplete="postal-code" required/></Field><Field label="Ort" icon={<MapPin/>}><input name="city" autoComplete="address-level2" required/></Field></div>
  <Field label="E-Mail-Adresse" icon={<Mail/>}><input name="email" autoComplete="email" required type="email"/></Field>
  <fieldset className="legalchecks"><legend>Rechtliche Bestätigungen</legend>
   {loading&&<p>Aktuelle Rechtstexte werden geladen …</p>}
   {documents.map(document=><div className="legal-version" key={document.id}><details onToggle={event=>{if(event.currentTarget.open)setOpened(items=>items.includes(document.id)?items:[...items,document.id])}}><summary>{document.title} · Version {document.version}</summary><div className="legal-version-content">{document.content}</div></details><label><input type="checkbox" disabled={!opened.includes(document.id)} checked={accepted.includes(document.id)} onChange={event=>setAccepted(items=>event.target.checked?[...items,document.id]:items.filter(item=>item!==document.id))}/><span>{document.documentKey==="datenschutz"?"Ich habe die Datenschutzerklärung gelesen und zur Kenntnis genommen.":`Ich habe ${document.title} gelesen und akzeptiere die Fassung für meine Organisation.`}</span></label></div>)}
   {documents.length>0&&<small>Bitte jeden Text öffnen und einzeln bestätigen. Die jeweils bestätigte Fassung wird als Nachweis gespeichert.</small>}
  </fieldset>
  {error&&<p className="autherror" role="alert">{error}</p>}<button disabled={busy||!all}>{busy?"Link wird erstellt …":<>Registrieren <ArrowRight size={18}/></>}</button>
 </form><p className="legalfooter"><a href="/rechtliches/impressum" target="_blank">Impressum</a><a href="/rechtliches/sla" target="_blank">SLA</a></p><button className="textlink" onClick={back}>Bereits registriert? Zum Login</button></Shell>
}

export function ConnectedLogin({back,register}:{back:()=>void;register:()=>void}){
 const router=useRouter();
 const [phase,setPhase]=useState<"login"|"mfa"|"event-code">("login"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[challenge,setChallenge]=useState(""),[hint,setHint]=useState(""),[error,setError]=useState("");
 async function login(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setError("");
  const fields=new FormData(e.currentTarget);
  const r=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:String(fields.get("organizationEmail")||email),password:String(fields.get("organizationPassword")||password),area:"web"})}),d=await r.json() as {error?:string;challenge?:string;previewCode?:string};
  if(!r.ok){setError(d.error||"Anmeldung fehlgeschlagen.");return}
  setPassword("");setChallenge(d.challenge||"");setHint(d.previewCode?"Lokaler Sicherheitscode: "+d.previewCode:"Der Sicherheitscode wurde per E-Mail versendet.");setPhase("mfa");
 }
 async function verify(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget),r=await fetch("/api/auth/mfa/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({challenge,code:f.get("code")})}),d=await r.json() as {error?:string;redirectTo?:string};
  if(!r.ok){setError(d.error||"Sicherheitscode ungültig.");return}router.replace(d.redirectTo==="/unternehmer"?"/unternehmer":"/");
 }
 async function eventLogin(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setError("");const f=new FormData(e.currentTarget),code=String(f.get("eventCode")||"").trim().toUpperCase().replace(/[\s-]/g,""),r=await fetch("/api/auth/event-code",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code})}),d=await r.json() as {error?:string;flow?:string;eventId?:string;attendanceCode?:string};if(!r.ok){setError(d.error||"Event-Code ungültig.");return}if(d.flow==="helper_attendance"&&d.eventId){router.replace(`/event-attendance?eventId=${encodeURIComponent(d.eventId)}&mode=come&code=${encodeURIComponent(d.attendanceCode||code)}`);return}router.replace("/")}
 function switchAccount(e:React.MouseEvent<HTMLButtonElement>){
  const form=e.currentTarget.form,emailInput=form?.elements.namedItem("organizationEmail") as HTMLInputElement|null,passwordInput=form?.elements.namedItem("organizationPassword") as HTMLInputElement|null;
  if(emailInput)emailInput.value="";
  if(passwordInput)passwordInput.value="";
  setEmail("");setPassword("");setError("");emailInput?.focus();
 }
 const title=phase==="login"?"Anmelden":phase==="mfa"?"Sicherheitscode":"Codelogin";
 const copy=phase==="login"?"Melde dich mit deinem RescueEd Alert Konto an. Dein Bereich öffnet sich automatisch.":phase==="mfa"?"Gib den sechsstelligen Sicherheitscode ein.":"Gib den einmalig für dieses Event erstellten achtstelligen Code ein. Danach werden nur die freigegebenen Funktionen angezeigt.";
 return <Shell back={back} title={title} copy={copy}>{phase==="login"?<form key="login" className="authform" onSubmit={login}><Field label="E-Mail-Adresse" icon={<Mail/>}><input name="organizationEmail" required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Passwort" icon={<LockKeyhole/>}><PasswordField name="organizationPassword" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field>{error&&<p className="autherror" role="alert">{error}</p>}<button>Anmelden <ArrowRight size={18}/></button><button type="button" className="textlink" onClick={switchAccount}>Anderes Konto verwenden</button><div className="code-login-separator"><span>oder ohne Benutzerkonto</span></div><button type="button" className="code-login-button" onClick={()=>{setError("");setPhase("event-code")}}><KeyRound/> Codelogin für ein Event <ArrowRight/></button></form>:phase==="mfa"?<form key="security-code" className="authform" autoComplete="off" onSubmit={verify}><Field label="Sicherheitscode" icon={<KeyRound/>}><input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6}/></Field><p className="authhint">{hint}</p>{error&&<p className="autherror" role="alert">{error}</p>}<button>Sicherheitscode bestätigen <ArrowRight size={18}/></button></form>:<form key="event-code" className="authform" autoComplete="off" onSubmit={eventLogin}><Field label="Einmalig erstellter Event-Code" icon={<KeyRound/>}><input name="eventCode" required autoFocus autoCapitalize="characters" autoComplete="off" inputMode="text" minLength={8} maxLength={10} placeholder="z. B. AB12CD34"/></Field>{error&&<p className="autherror" role="alert">{error}</p>}<button>Event mit Code öffnen <ArrowRight size={18}/></button><p className="event-code-note">Der Code gilt nur für das zugehörige Event und endet automatisch mit dessen Laufzeit.</p><button type="button" className="textlink" onClick={()=>{setError("");setPhase("login")}}>Zur Anmeldung mit E-Mail und Passwort</button></form>}{phase==="login"&&<Link className="textlink" href="/passwort-vergessen">Passwort vergessen?</Link>}{phase!=="event-code"&&<button className="textlink" onClick={register}>Noch kein Konto? Jetzt registrieren</button>}</Shell>;
}
