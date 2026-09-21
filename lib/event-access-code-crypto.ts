import type {EventAccessRole} from "@/lib/event-access";

const encoder=new TextEncoder(),decoder=new TextDecoder();
function encode(bytes:Uint8Array){let value="";for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function decode(value:string){const binary=atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"="));return Uint8Array.from(binary,character=>character.charCodeAt(0))}
function keyBytes(){
 const configured=process.env.EVENT_ACCESS_CODE_KEY?.trim();
 if(!configured)throw new Error("EVENT_ACCESS_CODE_KEY fehlt.");
 if(/^[0-9a-fA-F]{64}$/.test(configured))return Uint8Array.from(configured.match(/.{2}/g)!.map(pair=>Number.parseInt(pair,16)));
 try{const binary=atob(configured);const bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));if(bytes.length===32)return bytes}catch{}
 throw new Error("EVENT_ACCESS_CODE_KEY muss 32 Byte als Base64 oder 64-stelliges Hex enthalten.");
}
function aad(id:string,eventId:string,role:EventAccessRole){return encoder.encode(`rescueed-event-code:v1:${id}:${eventId}:${role}`)}

export async function encryptEventAccessCode(code:string,id:string,eventId:string,role:EventAccessRole){
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey("raw",keyBytes(),{name:"AES-GCM"},false,["encrypt"]);
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad(id,eventId,role)},key,encoder.encode(code));
 return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}

export async function decryptEventAccessCode(value:string,id:string,eventId:string,role:EventAccessRole){
 const [version,iv,ciphertext]=value.split(".");
 if(version!=="v1"||!iv||!ciphertext)throw new Error("Verschlüsselter Event-Code ist ungültig.");
 const key=await crypto.subtle.importKey("raw",keyBytes(),{name:"AES-GCM"},false,["decrypt"]);
 return decoder.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv),additionalData:aad(id,eventId,role)},key,decode(ciphertext)));
}
