import {env} from "cloudflare:workers";
import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {appSubscriptions} from "@/db/schema";
import {id,tokenHash} from "@/lib/security";

export type StoreName="google"|"apple";
type SubscriptionStatus="active"|"grace"|"expired"|"pending"|"revoked";
type Verified={status:SubscriptionStatus;expiresAt:Date|null;productId:string};
const encoder=new TextEncoder();
const live=(status:SubscriptionStatus,expiresAt:Date|null)=>["active","grace"].includes(status)&&!!expiresAt&&expiresAt.getTime()>Date.now();

function base64url(bytes:Uint8Array){let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function pemBytes(pem:string){const body=pem.replace(/-----[^-]+-----/g,"").replace(/\s/g,"");return Uint8Array.from(atob(body),char=>char.charCodeAt(0))}
function jsonPayload(jwt:string){const middle=jwt.split(".")[1];if(!middle)throw new Error("Ungültige Store-Antwort.");return JSON.parse(atob(middle.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(middle.length/4)*4,"="))) as Record<string,unknown>}
async function signJwt(header:Record<string,unknown>,payload:Record<string,unknown>,pem:string,algorithm:"RS256"|"ES256"){
 const data=`${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(encoder.encode(JSON.stringify(payload)))}`;
 const key=await crypto.subtle.importKey("pkcs8",pemBytes(pem),algorithm==="RS256"?{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"}:{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
 const signature=await crypto.subtle.sign(algorithm==="RS256"?{name:"RSASSA-PKCS1-v1_5"}:{name:"ECDSA",hash:"SHA-256"},key,encoder.encode(data));
 return `${data}.${base64url(new Uint8Array(signature))}`;
}
async function googleAccessToken(){
 if(!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)throw new Error("Google Play ist nicht konfiguriert.");
 const account=JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) as {client_email?:string;private_key?:string};
 if(!account.client_email||!account.private_key)throw new Error("Google Play Service Account ist unvollständig.");
 const now=Math.floor(Date.now()/1000),assertion=await signJwt({alg:"RS256",typ:"JWT"},{iss:account.client_email,scope:"https://www.googleapis.com/auth/androidpublisher",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+300},account.private_key,"RS256");
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error("Google Play Autorisierung fehlgeschlagen.");
 const data=await response.json() as {access_token?:string};if(!data.access_token)throw new Error("Google Play Autorisierung unvollständig.");return data.access_token;
}
async function verifyGoogle(reference:string,userId:string):Promise<Verified>{
 const packageName=env.GOOGLE_PLAY_PACKAGE_NAME,productId=env.GOOGLE_PLAY_PRODUCT_ID;
 if(!packageName||!productId)throw new Error("Google Play Produkt ist nicht konfiguriert.");
 const bearer=await googleAccessToken();
 const url=`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(reference)}`;
 const response=await fetch(url,{headers:{authorization:`Bearer ${bearer}`},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error("Google Play konnte das Abo nicht bestätigen.");
 const data=await response.json() as {subscriptionState?:string;lineItems?:Array<{productId?:string;expiryTime?:string}>;externalAccountIdentifiers?:{obfuscatedExternalAccountId?:string};acknowledgementState?:string};
 if(data.externalAccountIdentifiers?.obfuscatedExternalAccountId!==userId)throw new Error("Der Kauf gehört nicht zu diesem App-Konto.");
 const item=data.lineItems?.find(row=>row.productId===productId),expiresAt=item?.expiryTime?new Date(item.expiryTime):null;
 if(!item||!expiresAt||Number.isNaN(expiresAt.getTime()))throw new Error("Falsches oder ungültiges Google-Produkt.");
 let status:SubscriptionStatus="expired";
 if(data.subscriptionState==="SUBSCRIPTION_STATE_ACTIVE"||data.subscriptionState==="SUBSCRIPTION_STATE_CANCELED")status="active";
 else if(data.subscriptionState==="SUBSCRIPTION_STATE_IN_GRACE_PERIOD")status="grace";
 else if(data.subscriptionState==="SUBSCRIPTION_STATE_PENDING")status="pending";
 if(!live(status,expiresAt))status="expired";
 if(status==="active"&&data.acknowledgementState==="ACKNOWLEDGEMENT_STATE_PENDING"){
  const ackUrl=`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(reference)}:acknowledge`;
  const ack=await fetch(ackUrl,{method:"POST",headers:{authorization:`Bearer ${bearer}`,"content-type":"application/json"},body:"{}",signal:AbortSignal.timeout(8000)});
  if(!ack.ok)throw new Error("Google Play Kaufbestätigung fehlgeschlagen.");
 }
 return {status,expiresAt,productId};
}
async function appleAuthorization(){
 const {APPLE_BUNDLE_ID:bundleId,APPLE_ISSUER_ID:issuerId,APPLE_KEY_ID:keyId,APPLE_PRIVATE_KEY:privateKey}=env;
 if(!bundleId||!issuerId||!keyId||!privateKey)throw new Error("App Store ist nicht konfiguriert.");
 const now=Math.floor(Date.now()/1000);
 return signJwt({alg:"ES256",kid:keyId,typ:"JWT"},{iss:issuerId,iat:now,exp:now+300,aud:"appstoreconnect-v1",bid:bundleId},privateKey.replace(/\\n/g,"\n"),"ES256");
}
async function verifyApple(reference:string,userId:string):Promise<Verified>{
 const bundleId=env.APPLE_BUNDLE_ID,productId=env.APPLE_PRODUCT_ID;
 if(!bundleId||!productId||!/^\d{5,30}$/.test(reference))throw new Error("App Store Produkt oder Transaktion ungültig.");
 const bearer=await appleAuthorization();
 const read=async(base:string)=>fetch(`${base}/inApps/v1/subscriptions/${reference}`,{headers:{authorization:`Bearer ${bearer}`},signal:AbortSignal.timeout(8000)});
 let response=await read("https://api.storekit.apple.com");
 if(response.status===404&&env.APPLE_ALLOW_SANDBOX==="true")response=await read("https://api.storekit-sandbox.apple.com");
 if(!response.ok)throw new Error("App Store konnte das Abo nicht bestätigen.");
 const data=await response.json() as {bundleId?:string;data?:Array<{lastTransactions?:Array<{status?:number;signedTransactionInfo?:string}>}>};
 if(data.bundleId!==bundleId)throw new Error("App Store Bundle-ID stimmt nicht überein.");
 const candidates:Verified[]=[];
 for(const group of data.data||[])for(const item of group.lastTransactions||[]){
  if(!item.signedTransactionInfo)continue;
  // This JWS is parsed only from Apple's authenticated server-to-server response, never from client input.
  const transaction=jsonPayload(item.signedTransactionInfo);
  if(transaction.bundleId!==bundleId||transaction.productId!==productId||transaction.appAccountToken!==userId)continue;
  const expiry=Number(transaction.expiresDate),expiresAt=Number.isFinite(expiry)?new Date(expiry):null;
  if(!expiresAt||Number.isNaN(expiresAt.getTime()))continue;
  const status:SubscriptionStatus=item.status===1?"active":item.status===4?"grace":"expired";
  candidates.push({status:live(status,expiresAt)?status:"expired",expiresAt,productId});
 }
 const active=candidates.filter(candidate=>live(candidate.status,candidate.expiresAt)).sort((a,b)=>(b.expiresAt?.getTime()||0)-(a.expiresAt?.getTime()||0))[0];
 if(active)return active;
 if(candidates.length)return candidates.sort((a,b)=>(b.expiresAt?.getTime()||0)-(a.expiresAt?.getTime()||0))[0];
 throw new Error("Der App Store Kauf gehört nicht zu diesem App-Konto oder Produkt.");
}

export async function verifyStoreSubscription(store:StoreName,reference:string,userId:string){
 if(reference.length<5||reference.length>4096)throw new Error("Kaufreferenz ungültig.");
 return store==="google"?verifyGoogle(reference,userId):verifyApple(reference,userId);
}

function subscriptionKey(){
 const raw=env.APP_SUBSCRIPTION_KEY?.trim();if(!raw)throw new Error("APP_SUBSCRIPTION_KEY fehlt.");
 const bytes=Uint8Array.from(atob(raw),char=>char.charCodeAt(0));if(bytes.length!==32)throw new Error("APP_SUBSCRIPTION_KEY muss 32 Byte (Base64) enthalten.");return bytes;
}
async function encryptReference(reference:string,userId:string,store:StoreName){
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey("raw",subscriptionKey(),"AES-GCM",false,["encrypt"]);
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:encoder.encode(`${userId}:${store}`)},key,encoder.encode(reference));
 return `${base64url(iv)}.${base64url(new Uint8Array(ciphertext))}`;
}
function decodeBase64url(value:string){return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")),char=>char.charCodeAt(0))}
async function decryptReference(encrypted:string,userId:string,store:StoreName){
 const [iv,value]=encrypted.split(".");if(!iv||!value)throw new Error("Gespeicherte Kaufreferenz ungültig.");
 const key=await crypto.subtle.importKey("raw",subscriptionKey(),"AES-GCM",false,["decrypt"]);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decodeBase64url(iv),additionalData:encoder.encode(`${userId}:${store}`)},key,decodeBase64url(value)));
}

export async function claimSubscription(userId:string,store:StoreName,reference:string){
 const verified=await verifyStoreSubscription(store,reference,userId),db=getDb(),referenceHash=await tokenHash(reference),now=new Date();
 const [existing]=await db.select().from(appSubscriptions).where(and(eq(appSubscriptions.store,store),eq(appSubscriptions.storeReferenceHash,referenceHash))).limit(1);
 if(existing&&existing.userId!==userId)throw new Error("Dieser Kauf ist bereits einem anderen Konto zugeordnet.");
 if(existing)await db.update(appSubscriptions).set({status:verified.status,expiresAt:verified.expiresAt,lastVerifiedAt:now}).where(eq(appSubscriptions.id,existing.id));
 else await db.insert(appSubscriptions).values({id:id("sub"),userId,store,storeReferenceHash:referenceHash,storeReferenceEncrypted:await encryptReference(reference,userId,store),productId:verified.productId,status:verified.status,expiresAt:verified.expiresAt,lastVerifiedAt:now,createdAt:now});
 return {active:live(verified.status,verified.expiresAt),status:verified.status,expiresAt:verified.expiresAt};
}

export async function consumerEntitlement(userId:string){
 const db=getDb(),rows=await db.select().from(appSubscriptions).where(eq(appSubscriptions.userId,userId));
 if(!rows.length)return {active:false,status:"missing" as const,expiresAt:null};
 let hadStoreError=false;
 for(const row of rows){
  try{
   const reference=await decryptReference(row.storeReferenceEncrypted,userId,row.store),verified=await verifyStoreSubscription(row.store,reference,userId),now=new Date();
   await db.update(appSubscriptions).set({status:verified.status,expiresAt:verified.expiresAt,lastVerifiedAt:now}).where(eq(appSubscriptions.id,row.id));
   if(live(verified.status,verified.expiresAt))return {active:true,status:verified.status,expiresAt:verified.expiresAt};
  }catch(error){hadStoreError=true;console.error("subscription_recheck_failed",{store:row.store,error});}
 }
 return {active:false,status:hadStoreError?"unavailable" as const:"expired" as const,expiresAt:null};
}
