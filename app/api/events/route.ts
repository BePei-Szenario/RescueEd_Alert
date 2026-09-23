import {and,desc,eq,inArray,isNotNull,or} from "drizzle-orm";
import {getDb} from "@/db";
import {billingRecords,emailOutbox,eventAccessCodes,eventAdministrators,events,invoiceRequests,organizations} from "@/db/schema";
import {emailPayload} from "@/lib/email-signature";
import {eventDurationMinutes,eventPriceCents,SHORT_EVENT_MAX_MINUTES,STANDARD_EVENT_MAX_MINUTES} from "@/lib/event-duration";
import {senderFor} from "@/lib/email-settings";
import {outboxPayloadExpiresAt,sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {id,tokenHash} from "@/lib/security";
import {calendarYearRetentionEnd} from "@/lib/retention";
import {currentUser} from "@/lib/session";
import {legalReconfirmation} from "@/lib/legal-reconfirmation";
import {consumerEntitlement} from "@/lib/app-subscriptions";
import type {EventAccessRole} from "@/lib/event-access";
import {encryptEventAccessCode} from "@/lib/event-access-code-crypto";

const eventAccessRoles:EventAccessRole[]=["helper_attendance","helper_recorder","alarm_operator","event_manager"];
function eventCode(){const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",bytes=crypto.getRandomValues(new Uint8Array(8));return [...bytes].map(value=>alphabet[value%alphabet.length]).join("")}

export async function GET(){try{const owner=await currentUser();if(!owner||owner.role==="platform_owner"||owner.role==="platform_staff")return Response.json({error:"Bitte zuerst anmelden."},{status:401});const db=getDb(),memberships=await db.select({eventId:eventAdministrators.eventId}).from(eventAdministrators).where(and(eq(eventAdministrators.userId,owner.id),eq(eventAdministrators.role,"owner"),isNotNull(eventAdministrators.acceptedAt))),memberIds=memberships.map(row=>row.eventId);const access=owner.accountType==="organization"?undefined:memberIds.length?or(eq(events.ownerUserId,owner.id),inArray(events.id,memberIds)):eq(events.ownerUserId,owner.id);const rows=await db.select({id:events.id,name:events.name,eventDate:events.eventDate,helperLimit:events.helperLimit,priceCents:events.priceCents,status:events.status}).from(events).where(access?and(eq(events.organizationId,owner.organizationId),access):eq(events.organizationId,owner.organizationId)).orderBy(desc(events.createdAt));return Response.json({events:rows})}catch(error){console.error("event_list_failed",error);return Response.json({error:"Events konnten nicht geladen werden."},{status:500})}}

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;const owner=await currentUser();if(!owner||owner.role==="platform_owner"||owner.role==="platform_staff")return Response.json({error:"Bitte zuerst anmelden."},{status:401});
  const legalReview=await legalReconfirmation(owner);
  if(legalReview.required)return Response.json({error:legalReview.available?"Bitte bestätigen Sie zuerst die aktuellen Rechtstexte. Laufende Events bleiben erreichbar.":"Die aktuellen Rechtstexte sind derzeit nicht verfügbar. Neue Events können nicht angelegt werden.",legalUpdateRequired:true},{status:legalReview.available?428:503,headers:{"cache-control":"no-store"}});
  if(owner.accountType==="consumer"){
   const entitlement=await consumerEntitlement(owner.id);
   if(!entitlement.active)return Response.json({error:entitlement.status==="unavailable"?"Der Abo-Status ist derzeit nicht prüfbar. Bitte später erneut versuchen.":"Für ein neues Event ist ein aktives App-Abo erforderlich.",subscriptionStatus:entitlement.status},{status:entitlement.status==="unavailable"?503:402,headers:{"cache-control":"no-store"}});
  }
  const b=await request.json() as Record<string,unknown>;
  const count=Number(b.helperLimit);
  const name=String(b.name||"").trim(),eventDate=String(b.eventDate||""),endDate=String(b.endDate||""),startTime=String(b.startTime||""),endTime=String(b.endTime||"");
  const accessRoles=Array.isArray(b.accessRoles)?[...new Set(b.accessRoles.filter((value):value is EventAccessRole=>typeof value==="string"&&eventAccessRoles.includes(value as EventAccessRole)))]:[];
  if(Array.isArray(b.accessRoles)&&accessRoles.length!==b.accessRoles.length)return Response.json({error:"Mindestens eine ungültige Event-Zugangsrolle wurde übermittelt."},{status:400});
  const recipientName=owner.accountType==="consumer"?owner.fullName:String(b.recipientName||"").trim(),street=String(b.street||"").trim(),postalCode=String(b.postalCode||"").trim(),city=String(b.city||"").trim(),billingEmail=owner.accountType==="consumer"?owner.email:String(b.billingEmail||"").trim().toLowerCase();
  if(!name||!eventDate||!endDate||!startTime||!endTime||(owner.accountType!=="consumer"&&(!recipientName||!street||!postalCode||!city||!billingEmail)))return Response.json({error:"Bitte alle Pflichtfelder ausfüllen."},{status:400});
  if(!Number.isInteger(count)||count<1||count>1000)return Response.json({error:"Die Helferzahl muss zwischen 1 und 1000 liegen."},{status:400});
  if(name.length>160||recipientName.length>160||street.length>200||postalCode.length>10||city.length>120||billingEmail.length>254)return Response.json({error:"Eine Eingabe ist zu lang."},{status:400});
  const durationMinutes=eventDurationMinutes(eventDate,startTime,endDate,endTime);
  if(durationMinutes===null)return Response.json({error:"Bitte Beginn und Ende mit gültigem Datum und Uhrzeit angeben."},{status:400});
  if(durationMinutes<=0)return Response.json({error:"Das Eventende muss nach dem Beginn liegen."},{status:400});
  if(owner.accountType!=="consumer"&&!/^\S+@\S+\.\S+$/.test(billingEmail))return Response.json({error:"Bitte eine gültige Rechnungs-E-Mail angeben."},{status:400});
  const db=getDb(),[organization]=await db.select({name:organizations.name,billingEmail:organizations.billingEmail,complimentaryAccess:organizations.complimentaryAccess,unlimitedEventDuration:organizations.unlimitedEventDuration}).from(organizations).where(eq(organizations.id,owner.organizationId)).limit(1);
  if(!organization)return Response.json({error:"Organisation nicht gefunden."},{status:404});
  if(owner.accountType==="consumer"&&durationMinutes>STANDARD_EVENT_MAX_MINUTES)return Response.json({error:"Private App-Events dürfen höchstens 5 Tage dauern."},{status:400});
  if(owner.accountType!=="consumer"&&!organization.unlimitedEventDuration&&durationMinutes>STANDARD_EVENT_MAX_MINUTES)return Response.json({error:"Events dürfen höchstens 5 Tage dauern. Für längere Events ist die Dauernutzer-Freigabe erforderlich."},{status:400});
  const verifiedBillingEmail=organization?.billingEmail?.trim().toLowerCase();
  if(owner.accountType!=="consumer"&&(!verifiedBillingEmail||billingEmail!==verifiedBillingEmail))return Response.json({error:"Die Rechnungs-E-Mail muss mit den gespeicherten Organisationsdaten übereinstimmen."},{status:400});
  const accountLimit=await consumeRateLimit({scope:"event-create-account",subject:owner.id,limit:20,windowMs:60*60_000});if(!accountLimit.allowed)return rateLimited(accountLimit.retryAfterSeconds);
  const networkLimit=await consumeRateLimit({scope:"event-create-network",subject:requestNetwork(request),limit:40,windowMs:60*60_000});if(!networkLimit.allowed)return rateLimited(networkLimit.retryAfterSeconds);
  const complimentaryAccess=owner.accountType==="consumer"||organization.complimentaryAccess===true,priceCents=complimentaryAccess?0:eventPriceCents(count,durationMinutes);
  const now=new Date(),eventId=id("evt"),invoiceId=complimentaryAccess?null:id("inv"),joinToken=crypto.randomUUID().replaceAll("-",""),checkInCode=crypto.randomUUID().replaceAll("-",""),checkOutCode=crypto.randomUUID().replaceAll("-",""),adminId=id("adm"),mailId=id("mail");
  const accessExpiresAt=new Date(`${endDate}T${endTime}:00`),accessCodeRows=await Promise.all(accessRoles.map(async role=>{const code=eventCode(),accessId=id("eac");return {code,row:{id:accessId,eventId,role,codeHash:await tokenHash(code),codeEncrypted:await encryptEventAccessCode(code,accessId,eventId,role),expiresAt:accessExpiresAt,createdByUserId:owner.id,createdAt:now}}}));
  const netCents=Math.round(priceCents/1.19),vatCents=priceCents-netCents,senderEmail=await senderFor("customer_contact"),durationLabel=durationMinutes<=SHORT_EVENT_MAX_MINUTES?"bis 2 Tage":"über 2 bis 5 Tage";
  const eventPeriod=`${eventDate}, ${startTime} Uhr – ${endDate}, ${endTime} Uhr`;
  const consumer=owner.accountType==="consumer";
  const orderPayload=await sensitiveEmailPayload(request,mailId,"order_confirmation",emailPayload({template:"order_confirmation",orderReference:invoiceId||eventId,orderedAt:now.toISOString(),recipientName,...(consumer?{}:{billingAddress:{street,postalCode,city}}),event:{name,date:eventDate,endDate,startTime,endTime,period:eventPeriod,helperLimit:count},service:consumer?`RescueEd Alert Event im privaten App-Abo für bis zu ${count} Helfer`:`RescueEd Alert Event-Paket ${durationLabel} für bis zu ${count} Helfer`,paymentMethod:consumer?"Privates App-Abo":complimentaryAccess?"Kostenfreie Nutzung":"Rechnung",billingTiming:consumer?"Im aktiven Monatsabo enthalten; keine zusätzliche Eventabrechnung.":complimentaryAccess?"Keine zusätzliche Eventabrechnung":"Abrechnung am Monatsende",...(consumer?{}:{pricing:{currency:"EUR",vatRatePercent:complimentaryAccess?0:19,netCents,vatCents,grossCents:priceCents}}),message:consumer?"Das Event wurde im Rahmen Ihres aktiven privaten App-Abonnements angelegt. Für dieses Event entsteht keine zusätzliche Gebühr.":complimentaryAccess?"Das Event wurde im Rahmen Ihrer freigeschalteten kostenlosen Nutzung angelegt. Es entsteht keine Rechnungsanforderung.":"Vielen Dank für Ihre Bestellung. Wir haben Ihre Bestellung erhalten und bearbeiten diese so schnell wie möglich. Diese E-Mail bestätigt den Eingang Ihrer kostenpflichtigen Bestellung. Die Abrechnung erfolgt am Monatsende per Rechnung."}));
  const helperDeletionDeadline=new Date(new Date(`${endDate}T${endTime}:00.000Z`).getTime()+30*86400000),mailExpiry=outboxPayloadExpiresAt(now);
  await db.batch([
   db.insert(events).values({id:eventId,organizationId:owner.organizationId,ownerUserId:owner.id,name,eventDate,endDate,startTime,endTime,helperLimit:count,priceCents,publicJoinTokenHash:await tokenHash(joinToken),checkInCode,checkOutCode,createdAt:now,deleteHelpersAfter:helperDeletionDeadline}),
   ...(invoiceId?[db.insert(invoiceRequests).values({id:invoiceId,eventId,recipientName,street,postalCode,city,email:billingEmail,amountCents:priceCents,createdAt:now})]:[]),
   ...(invoiceId?[db.insert(billingRecords).values({id:invoiceId,customerName:owner.fullName,organizationName:organization.name,recipientName,street,postalCode,city,email:billingEmail,eventName:name,eventDate,helperLimit:count,amountCents:priceCents,currency:"EUR",createdAt:now,retainUntil:calendarYearRetentionEnd(now,8).getTime()})]:[]),
   db.insert(eventAdministrators).values({id:adminId,eventId,userId:owner.id,role:"owner",acceptedAt:now,createdAt:now}),
   ...accessCodeRows.map(item=>db.insert(eventAccessCodes).values(item.row)),
   db.insert(emailOutbox).values({id:mailId,userId:owner.id,type:"order_confirmation",senderEmail,recipientEmail:owner.email,subject:owner.accountType==="consumer"?`RescueEd Alert – Event im App-Abo ${name}`:complimentaryAccess?`RescueEd Alert – Kostenfreies Event ${name}`:`RescueEd Alert – Bestellbestätigung für ${name}`,payloadJson:orderPayload,sensitiveExpiresAt:mailExpiry,createdAt:now})
  ]);
  return Response.json({eventId,invoiceId,priceCents,netCents,vatCents,complimentaryAccess,confirmationEmailQueued:true,eventAccessCodes:accessCodeRows.map(item=>({role:item.row.role,code:item.code,expiresAt:item.row.expiresAt.toISOString()}))},{status:201});
 }catch(error){
  console.error("event_creation_failed",error);
  return Response.json({error:"Event konnte nicht gespeichert werden."},{status:500});
 }
}
