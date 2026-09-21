import "server-only";

const encoder=new TextEncoder(),decoder=new TextDecoder();
function owned(bytes:Uint8Array){const result=new Uint8Array(bytes.byteLength);result.set(bytes);return result}

function decodeKey(){
 const configured=process.env.PUSH_TOKEN_ENCRYPTION_KEY?.trim();
 if(!configured)throw new Error("PUSH_TOKEN_ENCRYPTION_KEY ist nicht konfiguriert.");
 let bytes:Uint8Array;
 if(/^[0-9a-f]{64}$/i.test(configured))bytes=Uint8Array.from(configured.match(/../g)!,value=>Number.parseInt(value,16));
 else{
  try{bytes=Uint8Array.from(atob(configured.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(configured.length/4)*4,"=")),char=>char.charCodeAt(0))}
  catch{throw new Error("PUSH_TOKEN_ENCRYPTION_KEY muss 32 Bytes als Hex oder Base64 enthalten.")}
 }
 if(bytes.length!==32)throw new Error("PUSH_TOKEN_ENCRYPTION_KEY muss genau 32 Bytes enthalten.");
 return owned(bytes);
}

function encode(bytes:Uint8Array){let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function decode(value:string){return owned(Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")),char=>char.charCodeAt(0)))}
function aad(helperId:string,platform:string){return encoder.encode(`rescueed-push:v1:${helperId}:${platform}`)}

export async function encryptPushToken(token:string,helperId:string,platform:string){
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey("raw",decodeKey(),"AES-GCM",false,["encrypt"]);
 const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad(helperId,platform)},key,encoder.encode(token));
 return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}

export async function decryptPushToken(value:string,helperId:string,platform:string){
 const [iv,ciphertext]=value.split(".");
 if(!iv||!ciphertext)throw new Error("Gespeichertes Push-Token ist ungültig.");
 const key=await crypto.subtle.importKey("raw",decodeKey(),"AES-GCM",false,["decrypt"]);
 return decoder.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv),additionalData:aad(helperId,platform)},key,decode(ciphertext)));
}
