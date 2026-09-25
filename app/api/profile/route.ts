import {and,desc,eq,inArray,ne} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,events,invoiceRequests,legalAcknowledgements,legalDocuments,legalDocumentVersions,organizations,users} from "@/db/schema";
import {consumeRateLimit,rateLimited} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {currentUser} from "@/lib/session";

export async function GET(){
 const account=await currentUser();
 if(!account)return Response.json({error:"Bitte zuerst anmelden."},{status:401});
 try{
  const db=getDb(),organizationAccount=account.accountType==="organization",canViewBilling=organizationAccount&&account.role==="customer",[organizationRows,acknowledgements,members,accountRows,invoices,documents]=await Promise.all([
   db.select({name:organizations.name,organizationType:organizations.organizationType,billingEmail:organizations.billingEmail,billingStreet:organizations.billingStreet,billingHouseNumber:organizations.billingHouseNumber,billingPostalCode:organizations.billingPostalCode,billingCity:organizations.billingCity}).from(organizations).where(eq(organizations.id,account.organizationId)).limit(1),
   db.select({documentKey:legalAcknowledgements.documentKey,version:legalAcknowledgements.documentVersion,acknowledgementType:legalAcknowledgements.acknowledgementType,acceptedAt:legalAcknowledgements.acceptedAt,title:legalDocumentVersions.title,signerId:users.id,signerName:users.fullName}).from(legalAcknowledgements).innerJoin(legalDocumentVersions,eq(legalAcknowledgements.documentVersionId,legalDocumentVersions.id)).innerJoin(users,eq(legalAcknowledgements.userId,users.id)).where(eq(legalAcknowledgements.organizationId,account.organizationId)),
   account.role==="customer"&&account.accountType==="organization"?db.select({id:users.id,name:users.fullName,email:users.email,status:users.status,emailVerifiedAt:users.emailVerifiedAt}).from(users).where(and(eq(users.organizationId,account.organizationId),eq(users.role,"organization_member"),ne(users.status,"deleted"))):Promise.resolve([]),
   db.select({protectedAccount:users.protectedAccount}).from(users).where(eq(users.id,account.id)).limit(1),
   canViewBilling?db.select({id:invoiceRequests.id,eventName:events.name,eventDate:events.eventDate,recipientName:invoiceRequests.recipientName,street:invoiceRequests.street,postalCode:invoiceRequests.postalCode,city:invoiceRequests.city,email:invoiceRequests.email,amountCents:invoiceRequests.amountCents,status:invoiceRequests.status,createdAt:invoiceRequests.createdAt,transmittedAt:invoiceRequests.transmittedAt}).from(invoiceRequests).innerJoin(events,eq(invoiceRequests.eventId,events.id)).where(eq(events.organizationId,account.organizationId)).orderBy(desc(invoiceRequests.createdAt)):Promise.resolve([]),
   organizationAccount?db.select({documentKey:legalDocuments.documentKey,title:legalDocuments.title,version:legalDocuments.version,pdfFileName:legalDocuments.pdfFileName}).from(legalDocuments).where(and(eq(legalDocuments.status,"published"),inArray(legalDocuments.documentKey,["agb","datenschutz","impressum","avv","sla"]))):Promise.resolve([])
  ]);
  const organization=organizationRows[0];
  return Response.json({profile:{id:account.id,name:account.fullName,email:account.email,role:account.role,accountType:account.accountType,organization:organization?{name:organization.name,organizationType:organization.organizationType,billingEmail:canViewBilling?organization.billingEmail:null,billingStreet:canViewBilling?organization.billingStreet:null,billingHouseNumber:canViewBilling?organization.billingHouseNumber:null,billingPostalCode:canViewBilling?organization.billingPostalCode:null,billingCity:canViewBilling?organization.billingCity:null,canViewBilling,canEdit:canViewBilling}:null,canDeleteAccount:account.role==="customer"&&organizationAccount&&!accountRows[0]?.protectedAccount},acknowledgements:acknowledgements.map(row=>({...row,acceptedAt:row.acceptedAt.toISOString(),own:row.signerId===account.id})),legalDocuments:documents,members:members.map(member=>({...member,emailVerifiedAt:member.emailVerifiedAt?.toISOString()??null})),invoices:invoices.map(invoice=>({...invoice,createdAt:invoice.createdAt.toISOString(),transmittedAt:invoice.transmittedAt?.toISOString()??null}))},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("profile_read_failed",error);return Response.json({error:"Profil konnte nicht geladen werden."},{status:500})}
}

export async function PATCH(request:Request){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 const account=await currentUser();
 if(!account)return Response.json({error:"Bitte zuerst anmelden."},{status:401});
 if(account.accountType!=="organization"||account.role!=="customer")return Response.json({error:"Nur das Organisations-Hauptkonto darf Stammdaten ändern."},{status:403});
 const limit=await consumeRateLimit({scope:"organization-profile",subject:account.id,limit:10,windowMs:15*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
 try{
  const body=await request.json() as Record<string,unknown>,name=String(body.name||"").trim(),billingEmail=String(body.billingEmail||"").trim().toLowerCase(),billingStreet=String(body.billingStreet||"").trim(),billingHouseNumber=String(body.billingHouseNumber||"").trim(),billingPostalCode=String(body.billingPostalCode||"").trim(),billingCity=String(body.billingCity||"").trim();
  if(!name||!billingEmail||!billingStreet||!billingHouseNumber||!billingPostalCode||!billingCity)return Response.json({error:"Bitte alle Organisations- und Rechnungsdaten ausfüllen."},{status:400});
  if(name.length>160||billingEmail.length>254||billingStreet.length>160||billingHouseNumber.length>30||billingPostalCode.length>20||billingCity.length>120)return Response.json({error:"Eine Eingabe ist zu lang."},{status:400});
  if(!/^\S+@\S+\.\S+$/.test(billingEmail))return Response.json({error:"Bitte eine gültige Rechnungs-E-Mail angeben."},{status:400});
  const db=getDb(),now=new Date();
  await db.batch([
   db.update(organizations).set({name,billingEmail,billingStreet,billingHouseNumber,billingPostalCode,billingCity}).where(eq(organizations.id,account.organizationId)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:account.id,action:"organization.profile_updated",entityType:"organization",entityId:account.organizationId,metadataJson:JSON.stringify({changedFields:["name","billingEmail","billingStreet","billingHouseNumber","billingPostalCode","billingCity"]}),createdAt:now})
  ]);
  return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("profile_update_failed",error);return Response.json({error:"Organisationsdaten konnten nicht gespeichert werden."},{status:500})}
}
