import {desc,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {emailOutbox,eventAdministrators,events,invoiceRequests} from "@/db/schema";
import {emailPayload} from "@/lib/email-signature";
import {senderFor} from "@/lib/email-settings";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";
import {currentUser} from "@/lib/session";

export async function GET(){try{const owner=await currentUser();if(!owner)return Response.json({error:"Bitte zuerst anmelden."},{status:401});const rows=await getDb().select({id:events.id,name:events.name,eventDate:events.eventDate,helperLimit:events.helperLimit,priceCents:events.priceCents,status:events.status}).from(events).where(eq(events.organizationId,owner.organizationId)).orderBy(desc(events.createdAt));return Response.json({events:rows})}catch(error){console.error("event_list_failed",error);return Response.json({error:"Events konnten nicht geladen werden."},{status:500})}}

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;const owner=await currentUser();if(!owner)return Response.json({error:"Bitte zuerst anmelden."},{status:401});
  const b=await request.json() as Record<string,string|number>;
  const count=Math.max(1,Number(b.helperLimit)||1),priceCents=count<=20?599:999;
  const name=String(b.name||"").trim(),eventDate=String(b.eventDate||""),startTime=String(b.startTime||""),endTime=String(b.endTime||"");
  const recipientName=String(b.recipientName||"").trim(),street=String(b.street||"").trim(),postalCode=String(b.postalCode||"").trim(),city=String(b.city||"").trim(),billingEmail=String(b.billingEmail||"").trim().toLowerCase();
  if(!name||!eventDate||!startTime||!endTime||!recipientName||!street||!postalCode||!city||!billingEmail)return Response.json({error:"Bitte alle Pflichtfelder ausfüllen."},{status:400});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime))return Response.json({error:"Bitte Datum, Beginn und Ende korrekt angeben."},{status:400});
  if(!/^\S+@\S+\.\S+$/.test(billingEmail))return Response.json({error:"Bitte eine gültige Rechnungs-E-Mail angeben."},{status:400});
  const db=getDb(),now=new Date(),eventId=id("evt"),invoiceId=id("inv"),joinToken=crypto.randomUUID().replaceAll("-",""),checkInCode=crypto.randomUUID().replaceAll("-",""),checkOutCode=crypto.randomUUID().replaceAll("-",""),adminId=id("adm"),mailId=id("mail");
  const netCents=Math.round(priceCents/1.19),vatCents=priceCents-netCents,senderEmail=await senderFor("customer_contact");
  const eventPeriod=`${eventDate}, ${startTime}–${endTime} Uhr`;
  await db.batch([
   db.insert(events).values({id:eventId,organizationId:owner.organizationId,ownerUserId:owner.id,name,eventDate,startTime,endTime,helperLimit:count,priceCents,publicJoinTokenHash:await tokenHash(joinToken),checkInCode,checkOutCode,createdAt:now,deleteHelpersAfter:new Date(now.getTime()+30*86400000)}),
   db.insert(invoiceRequests).values({id:invoiceId,eventId,recipientName,street,postalCode,city,email:billingEmail,amountCents:priceCents,createdAt:now}),
   db.insert(eventAdministrators).values({id:adminId,eventId,userId:owner.id,role:"owner",acceptedAt:now,createdAt:now}),
   db.insert(emailOutbox).values({id:mailId,userId:owner.id,type:"order_confirmation",senderEmail,recipientEmail:billingEmail,subject:`RescueEd Alert – Bestellbestätigung für ${name}`,payloadJson:emailPayload({template:"order_confirmation",orderReference:invoiceId,orderedAt:now.toISOString(),recipientName,billingAddress:{street,postalCode,city},event:{name,date:eventDate,startTime,endTime,period:eventPeriod,helperLimit:count},service:`RescueEd Alert Event-Paket für bis zu ${count} Helfer`,paymentMethod:"Rechnung",billingTiming:"Abrechnung am Monatsende",pricing:{currency:"EUR",vatRatePercent:19,netCents,vatCents,grossCents:priceCents},message:"Vielen Dank für Ihre Bestellung. Wir haben Ihre Bestellung erhalten und bearbeiten diese so schnell wie möglich. Diese E-Mail bestätigt den Eingang Ihrer kostenpflichtigen Bestellung. Die Abrechnung erfolgt am Monatsende per Rechnung."}),createdAt:now})
  ]);
  return Response.json({eventId,invoiceId,priceCents,netCents,vatCents,joinToken,confirmationEmailQueued:true},{status:201});
 }catch(error){
  console.error("event_creation_failed",error);
  return Response.json({error:"Event konnte nicht gespeichert werden."},{status:500});
 }
}
