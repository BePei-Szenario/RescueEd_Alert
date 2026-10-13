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
async function encrypt(value:string,aadValue:string){
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey("raw",keyBytes(),{name:"AES-GCM"},false,["encrypt"]);
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:encoder.encode(aadValue)},key,encoder.encode(value));
 return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}
async function decrypt(value:string,aadValue:string){
 const [version,iv,ciphertext]=value.split(".");if(version!=="v1"||!iv||!ciphertext)throw new Error("Verschlüsseltes Dienstplan-Geheimnis ist ungültig.");
 const key=await crypto.subtle.importKey("raw",keyBytes(),{name:"AES-GCM"},false,["decrypt"]);
 return decoder.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv),additionalData:encoder.encode(aadValue)},key,decode(ciphertext)));
}

export function normalizeDutyEmail(value:string){return value.trim().toLowerCase()}
export async function hashDutyEmail(email:string){return crypto.subtle.digest("SHA-256",encoder.encode(normalizeDutyEmail(email))).then(buffer=>[...new Uint8Array(buffer)].map(byte=>byte.toString(16).padStart(2,"0")).join(""))}
export function maskDutyEmail(email:string){if(!email.trim())return "";const [local,domain]=normalizeDutyEmail(email).split("@");if(!local||!domain)return "***";return `${local.slice(0,1)}***@${domain}`}

export function generateDutyCode(){const bytes=crypto.getRandomValues(new Uint32Array(1));return String(bytes[0]%100_000_000).padStart(8,"0")}
export function normalizeDutyCode(value:string){return value.replace(/\D/g,"")}
export async function encryptDutyCode(code:string,bookingId:string,eventId:string){return encrypt(code,`rescueed-duty-code:v1:${bookingId}:${eventId}`)}
export async function decryptDutyCode(value:string,bookingId:string,eventId:string){return decrypt(value,`rescueed-duty-code:v1:${bookingId}:${eventId}`)}
export async function encryptDutyEmail(email:string,recordKind:"invitation"|"booking",recordId:string,eventId:string){return encrypt(normalizeDutyEmail(email),`rescueed-duty-email:v1:${recordKind}:${recordId}:${eventId}`)}
export async function decryptDutyEmail(value:string,recordKind:"invitation"|"booking",recordId:string,eventId:string){return decrypt(value,`rescueed-duty-email:v1:${recordKind}:${recordId}:${eventId}`)}
