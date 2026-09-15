"use client";
import {useEffect,useState} from "react";
import "./welcome.css";
import {NewWelcome} from "./flows";
import {ConnectedCreateEvent as CreateEvent,ConnectedEvents as Events} from "./connected-events";
import {ConnectedDashboard} from "./connected-dashboard";
import {ConnectedLogin,ConnectedRegister} from "./connected-auth";

type Screen="loading"|"welcome"|"login"|"register"|"events"|"create"|"dashboard";

export default function Home(){
 const [screen,setScreen]=useState<Screen>("loading"),[eventId,setEventId]=useState("");
 useEffect(()=>{let active=true;fetch("/api/auth/me",{cache:"no-store"}).then(async response=>response.ok?response.json():null).then(raw=>{if(!active)return;const user=raw as {role?:string}|null;if(user?.role==="platform_owner"){window.location.assign("/unternehmer");return}setScreen(user?"events":"welcome")}).catch(()=>{if(active)setScreen("welcome")});return()=>{active=false}},[]);
 useEffect(()=>{if(screen!=="events")return;fetch("/api/auth/me").then(response=>response.ok?response.json():null).then(raw=>{const user=raw as {role?:string}|null;if(user?.role==="platform_owner")window.location.assign("/unternehmer")}).catch(()=>{})},[screen]);
 const logout=async()=>{await fetch("/api/auth/logout",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).catch(()=>{});setEventId("");setScreen("welcome")};
 if(screen==="loading")return <main className="portal"><div className="portal-session-loading">Sitzung wird geprüft …</div></main>;
 if(screen==="welcome")return <NewWelcome login={()=>setScreen("login")} register={()=>setScreen("register")}/>;
 if(screen==="login")return <ConnectedLogin back={()=>setScreen("welcome")} submit={()=>setScreen("events")} register={()=>setScreen("register")}/>;
 if(screen==="register")return <ConnectedRegister back={()=>setScreen("login")} submit={()=>setScreen("events")}/>;
 if(screen==="events")return <Events open={id=>{setEventId(id);setScreen("dashboard")}} create={()=>setScreen("create")} logout={logout}/>;
 if(screen==="create")return <CreateEvent back={()=>setScreen("events")} done={()=>setScreen("events")}/>;
 if(screen==="dashboard"&&eventId)return <ConnectedDashboard eventId={eventId} home={()=>setScreen("events")} logout={logout}/>;
 return null;
}
