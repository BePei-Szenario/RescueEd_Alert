const encoder=new TextEncoder();
function hex(bytes:ArrayBuffer){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")}
export async function hashSecret(value:string,salt=crypto.randomUUID()){
 const key=await crypto.subtle.importKey("raw",encoder.encode(value),"PBKDF2",false,["deriveBits"]);
 const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:encoder.encode(salt),iterations:210000},key,256);
 return `pbkdf2-sha256$210000$${salt}$${hex(bits)}`;
}
export async function verifySecret(value:string,encoded:string){
 const [,iterations,salt,expected]=encoded.split("$");if(!iterations||!salt||!expected)return false;
 const actual=await hashSecretWithIterations(value,salt,Number(iterations));return timingSafe(actual,expected);
}
async function hashSecretWithIterations(value:string,salt:string,iterations:number){
 const key=await crypto.subtle.importKey("raw",encoder.encode(value),"PBKDF2",false,["deriveBits"]);
 return hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:encoder.encode(salt),iterations},key,256));
}
function timingSafe(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
export async function tokenHash(value:string){return hex(await crypto.subtle.digest("SHA-256",encoder.encode(value)))}
export function id(prefix:string){return `${prefix}_${crypto.randomUUID()}`}
