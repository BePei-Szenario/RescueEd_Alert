import {getDb} from "@/db";
import {emailOutbox,securityTokens,users} from "@/db/schema";
import {eq} from "drizzle-orm";
import {id,tokenHash} from "@/lib/security";
import {senderFor} from "@/lib/email-settings";
import {emailPayload} from "@/lib/email-signature";

export async function POST(request:Request){
 try{
  const {email}=await request.json() as {email?:string};if(!email)return Response.json({error:"E-Mail fehlt."},{status:400});
  const db=getDb(),[user]=await db.select({id:users.id,email:users.email}).from(users).where(eq(users.email,email.toLowerCase())).limit(1);
  if(!user)return Response.json({ok:true});
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0"),now=new Date(),expiresAt=new Date(now.getTime()+10*60*1000),senderEmail=await senderFor("mfa");
  await db.batch([
   db.insert(securityTokens).values({id:id("sec"),userId:user.id,purpose:"mfa",tokenHash:await tokenHash(code),expiresAt,createdAt:now}),
   db.insert(emailOutbox).values({id:id("mail"),userId:user.id,type:"mfa",senderEmail,recipientEmail:user.email,subject:"Ihr RescueEd Alert Sicherheitscode",payloadJson:emailPayload({template:"security_code",securityCode:code,expiresAt:expiresAt.toISOString(),message:"Mit diesem Sicherheitscode schließen Sie Ihre Anmeldung bei RescueEd Alert ab."}),createdAt:now})
  ]);
  return Response.json({ok:true});
 }catch(error){console.error("mfa_request_failed",error);return Response.json({error:"Sicherheitscode konnte nicht erstellt werden."},{status:500})}
}
