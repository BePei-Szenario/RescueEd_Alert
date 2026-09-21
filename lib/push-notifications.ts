import "server-only";
import {and,eq,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {alertRecipients,helperDevices} from "@/db/schema";
import {decryptPushToken} from "@/lib/push-token-crypto";

const encoder=new TextEncoder();
const tones=new Set(["piep_piep","doodoo","reverb","sirene","vollalarm","vibration"]);
const state=globalThis as typeof globalThis&{rescueEdFcmAccess?:{token:string;expiresAt:number}};

function base64url(bytes:Uint8Array){let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function pemBytes(pem:string){const body=pem.replace(/-----[^-]+-----/g,"").replace(/\s/g,"");return Uint8Array.from(atob(body),char=>char.charCodeAt(0))}
async function signJwt(email:string,pem:string){
 const now=Math.floor(Date.now()/1000),header={alg:"RS256",typ:"JWT"},payload={iss:email,scope:"https://www.googleapis.com/auth/firebase.messaging",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+300};
 const data=`${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(encoder.encode(JSON.stringify(payload)))}`;
 const key=await crypto.subtle.importKey("pkcs8",pemBytes(pem),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const signature=await crypto.subtle.sign({name:"RSASSA-PKCS1-v1_5"},key,encoder.encode(data));
 return `${data}.${base64url(new Uint8Array(signature))}`;
}

function serviceAccount(){
 const configured=process.env.FCM_SERVICE_ACCOUNT_JSON;
 if(!configured)return null;
 const account=JSON.parse(configured) as {client_email?:string;private_key?:string;project_id?:string};
 if(!account.client_email||!account.private_key||!account.project_id)throw new Error("FCM_SERVICE_ACCOUNT_JSON ist unvollständig.");
 return {email:account.client_email,privateKey:account.private_key.replace(/\\n/g,"\n"),projectId:process.env.FCM_PROJECT_ID||account.project_id};
}

async function accessToken(account:ReturnType<typeof serviceAccount>&{}){
 const cached=state.rescueEdFcmAccess;
 if(cached&&cached.expiresAt>Date.now()+60_000)return cached.token;
 const assertion=await signJwt(account.email,account.privateKey);
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error(`FCM-Autorisierung fehlgeschlagen (${response.status}).`);
 const data=await response.json() as {access_token?:string;expires_in?:number};
 if(!data.access_token)throw new Error("FCM-Autorisierung lieferte kein Zugriffstoken.");
 state.rescueEdFcmAccess={token:data.access_token,expiresAt:Date.now()+Math.max(300,Math.min(data.expires_in||3600,3600))*1000};
 return data.access_token;
}

function channel(tone:string){return tone==="vibration"?"rescueed_alarms_vibration":`rescueed_sound_${tone}_v1`}
function sound(tone:string){return tone==="vibration"?undefined:`tone_${tone}.wav`}
function unregistered(status:number,payload:string){return status===404||payload.includes("UNREGISTERED")||payload.includes("registration-token-not-registered")}

export async function dispatchAlertPush(alertId:string,eventId:string){
 const account=serviceAccount();
 if(!account||!process.env.PUSH_TOKEN_ENCRYPTION_KEY)return {configured:false,attempted:0,sent:0};
 const db=getDb(),devices=await db.select({id:helperDevices.id,helperId:helperDevices.helperId,platform:helperDevices.platform,tone:helperDevices.alarmTone,encrypted:helperDevices.pushTokenEncrypted}).from(alertRecipients).innerJoin(helperDevices,eq(helperDevices.helperId,alertRecipients.helperId)).where(and(eq(alertRecipients.alertId,alertId),isNull(alertRecipients.acknowledgedAt),isNull(helperDevices.disabledAt)));
 if(!devices.length)return {configured:true,attempted:0,sent:0};
 const bearer=await accessToken(account),now=new Date();let sent=0;
 for(let offset=0;offset<devices.length;offset+=20){
  await Promise.all(devices.slice(offset,offset+20).map(async device=>{
   if(!device.encrypted)return;
   const tone=tones.has(device.tone)?device.tone:"piep_piep";
   try{
    const token=await decryptPushToken(device.encrypted,device.helperId,device.platform),message={token,data:{type:"alarm",alertId,eventId},notification:{title:"RescueEd Alert · ALARM",body:"Neue Alarmierung. Details nach dem Entsperren in der App."},android:{priority:"HIGH",ttl:"300s",notification:{channel_id:channel(tone),visibility:"PRIVATE",default_vibrate_timings:true}},apns:{headers:{"apns-priority":"10","apns-push-type":"alert","apns-expiration":String(Math.floor(Date.now()/1000)+300)},payload:{aps:{sound:sound(tone),"interruption-level":"time-sensitive","thread-id":`rescueed-${eventId}`}}}};
    const response=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`,{method:"POST",headers:{authorization:`Bearer ${bearer}`,"content-type":"application/json"},body:JSON.stringify({message}),signal:AbortSignal.timeout(8000)}),payload=await response.text();
    if(!response.ok){await db.update(helperDevices).set({lastPushAt:now,pushFailures:1,...(unregistered(response.status,payload)?{disabledAt:now}:{})}).where(eq(helperDevices.id,device.id));return}
    sent+=1;await db.update(helperDevices).set({lastPushAt:now,pushFailures:0}).where(eq(helperDevices.id,device.id));
   }catch(error){console.error("push_delivery_failed",{deviceId:device.id,error:error instanceof Error?error.message:"unknown"});await db.update(helperDevices).set({lastPushAt:now,pushFailures:1}).where(eq(helperDevices.id,device.id))}
  }));
 }
 return {configured:true,attempted:devices.length,sent};
}
