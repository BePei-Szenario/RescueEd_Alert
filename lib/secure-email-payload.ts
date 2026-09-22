
export type EncryptedMailType="customer_contact"|"mfa"|"registration_link"|"password_reset"|"order_confirmation"|"event_deletion_summary"|"withdrawal_confirmation";
export const OUTBOX_PAYLOAD_RETENTION_MS=7*24*60*60*1000;
export function outboxPayloadExpiresAt(now:Date){return new Date(now.getTime()+OUTBOX_PAYLOAD_RETENTION_MS)}

function bytesToBase64(bytes:Uint8Array){let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary)}
function decodeKey(value:string){
 const clean=value.trim();
 if(/^[0-9a-fA-F]{64}$/.test(clean))return Uint8Array.from(clean.match(/.{2}/g)!.map(pair=>Number.parseInt(pair,16)));
 try{const binary=atob(clean);return Uint8Array.from(binary,char=>char.charCodeAt(0))}catch{return new Uint8Array()}
}
function isLoopback(request:Request){const host=new URL(request.url).hostname.toLowerCase();return host==="localhost"||host==="127.0.0.1"||host==="[::1]"}

export async function sensitiveEmailPayload(request:Request,rowId:string,type:EncryptedMailType,payload:string){
 const configured=process.env.EMAIL_PAYLOAD_KEY?.trim();
 if(!configured){
  if(isLoopback(request))return payload;
  throw new Error("EMAIL_PAYLOAD_KEY fehlt für einen sicherheitsrelevanten E-Mail-Auftrag.");
 }
 const rawKey=decodeKey(configured);
 if(rawKey.length!==32)throw new Error("EMAIL_PAYLOAD_KEY muss 32 Byte als Base64 oder 64-stelliges Hex enthalten.");
 const iv=crypto.getRandomValues(new Uint8Array(12)),aad=`rescueed-email:v1:${type}:${rowId}`;
 const key=await crypto.subtle.importKey("raw",rawKey,{name:"AES-GCM"},false,["encrypt"]);
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(aad)},key,new TextEncoder().encode(payload));
 return JSON.stringify({v:1,alg:"A256GCM",aad,iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(ciphertext))});
}
