import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {emailOutbox,securityTokens,users} from "@/db/schema";
import {emailPayload} from "@/lib/email-signature";
import {senderFor} from "@/lib/email-settings";
import {clearRateLimit,consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {id,tokenHash,verifySecret} from "@/lib/security";

const DUMMY_HASH="pbkdf2-sha256$210000$rescueed-login-timing$0000000000000000000000000000000000000000000000000000000000000000";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {email,password,area}=await request.json() as {email?:string;password?:string;area?:string};
  const normalizedEmail=email?.trim().toLowerCase()||"";
  if(!normalizedEmail||!password||normalizedEmail.length>254||password.length>1024)return Response.json({error:"E-Mail und Passwort erforderlich."},{status:400});
  const network=requestNetwork(request),networkLimit=await consumeRateLimit({scope:"login-network",subject:network,limit:30,windowMs:15*60_000});
  if(!networkLimit.allowed)return rateLimited(networkLimit.retryAfterSeconds);
  const accountSubject=JSON.stringify([normalizedEmail,network]),accountLimit=await consumeRateLimit({scope:"login-account-network",subject:accountSubject,limit:10,windowMs:15*60_000});
  if(!accountLimit.allowed)return rateLimited(accountLimit.retryAfterSeconds);
  const db=getDb(),[user]=await db.select().from(users).where(eq(users.email,normalizedEmail)).limit(1);
  const validPassword=await verifySecret(password,user?.passwordHash||DUMMY_HASH);
  const allowedArea=area==="unternehmer"?(user?.role==="platform_owner"||user?.role==="platform_staff"):area==="mobile_consumer"?user?.accountType==="consumer":user?.accountType==="organization"&&(user.role==="customer"||user.role==="organization_member");
  if(!user||user.status!=="active"||!validPassword)return Response.json({error:"Anmeldedaten sind ungültig."},{status:401});
  if(!allowedArea)return Response.json({error:area==="unternehmer"||area==="mobile_consumer"&&user.accountType==="organization"?"Dieses Konto gehört zur Organisationsanmeldung. Bitte dort anmelden.":user.role==="platform_owner"||user.role==="platform_staff"?"Dieses Konto gehört zur Unternehmerplattform. Bitte dort anmelden.":"Dieser Zugang ist nur in der App möglich."},{status:403});
  const issueLimit=await consumeRateLimit({scope:"mfa-issue-account",subject:user.id,limit:5,windowMs:10*60_000});
  if(!issueLimit.allowed)return rateLimited(issueLimit.retryAfterSeconds);
  await clearRateLimit("login-account-network",accountSubject);
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1_000_000).padStart(6,"0"),challenge=crypto.randomUUID()+crypto.randomUUID(),now=new Date(),expiresAt=new Date(now.getTime()+10*60_000),senderEmail=await senderFor("mfa"),mailId=id("mail"),tokenId=id("sec"),challengeArea=area==="unternehmer"?"unternehmer":area==="mobile_consumer"?"mobile_consumer":"customer";
  const payload=await sensitiveEmailPayload(request,mailId,"mfa",emailPayload({template:"security_code",securityCode:code,expiresAt:expiresAt.toISOString(),message:"Mit diesem Sicherheitscode schließen Sie Ihre Anmeldung bei RescueEd Alert ab."}));
  await db.batch([
   db.insert(securityTokens).values({id:tokenId,userId:user.id,purpose:"mfa",tokenHash:await tokenHash(code),challengeHash:await tokenHash(challenge),challengeArea,expiresAt,createdAt:now}),
   db.insert(emailOutbox).values({id:mailId,userId:user.id,type:"mfa",senderEmail,recipientEmail:user.email,subject:"Ihr RescueEd Alert Sicherheitscode",payloadJson:payload,sensitiveExpiresAt:expiresAt,createdAt:now})
  ]);
  return Response.json({mfaRequired:true,challenge,previewCode:process.env.NODE_ENV==="production"?undefined:code},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("login_failed",error);return Response.json({error:"Anmeldung konnte nicht verarbeitet werden."},{status:500})}
}
