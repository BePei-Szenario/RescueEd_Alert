import {getDb} from "@/db";
import {emailOutbox,securityTokens,users} from "@/db/schema";
import {eq} from "drizzle-orm";
import {id,tokenHash,verifySecret} from "@/lib/security";
import {senderFor} from "@/lib/email-settings";
import {emailPayload} from "@/lib/email-signature";
export async function POST(request:Request){
 try{
  const {email,password,area}=await request.json() as {email?:string;password?:string;area?:string};
  if(!email||!password)return Response.json({error:"E-Mail und Passwort erforderlich."},{status:400});
  const db=getDb(),[user]=await db.select().from(users).where(eq(users.email,email.trim().toLowerCase())).limit(1);
  if(!user||user.status!=="active"||(area==="unternehmer"&&user.role!=="platform_owner")||!(await verifySecret(password,user.passwordHash)))return Response.json({error:"Anmeldedaten sind ungültig."},{status:401});
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0"),now=new Date(),expiresAt=new Date(now.getTime()+10*60000),senderEmail=await senderFor("mfa");
  await db.batch([db.insert(securityTokens).values({id:id("sec"),userId:user.id,purpose:"mfa",tokenHash:await tokenHash(code),expiresAt,createdAt:now}),db.insert(emailOutbox).values({id:id("mail"),userId:user.id,type:"mfa",senderEmail,recipientEmail:user.email,subject:"Ihr RescueEd Alert Sicherheitscode",payloadJson:emailPayload({template:"security_code",securityCode:code,expiresAt:expiresAt.toISOString(),message:"Mit diesem Sicherheitscode schließen Sie Ihre Anmeldung bei RescueEd Alert ab."}),createdAt:now})]);
  return Response.json({mfaRequired:true,userId:user.id,previewCode:process.env.NODE_ENV==="production"?undefined:code});
 }catch(error){console.error("login_failed",error);return Response.json({error:"Anmeldung konnte nicht verarbeitet werden."},{status:500})}
}
