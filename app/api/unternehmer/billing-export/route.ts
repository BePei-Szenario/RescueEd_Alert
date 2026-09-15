import {and,eq,gte,lt} from "drizzle-orm";
import {getDb} from "@/db";
import {deletedCustomerArchives,events,invoiceRequests,users} from "@/db/schema";
import {requirePlatformOwnerApi} from "@/lib/session";
function cell(value:unknown){let text=String(value??"").replace(/\r?\n/g," ");if(/^[=+\-@]/.test(text))text="'"+text;return `"${text.replaceAll('"','""')}"`}
function money(cents:number){return (cents/100).toFixed(2).replace(".",",")}

export async function GET(request:Request){
 const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
 const month=new URL(request.url).searchParams.get("month")||"";
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return Response.json({error:"Monat muss als JJJJ-MM angegeben werden."},{status:400});
 const [year,number]=month.split("-").map(Number),start=new Date(Date.UTC(year,number-1,1)),end=new Date(Date.UTC(year,number,1));
 const rows=await getDb().select({createdAt:invoiceRequests.createdAt,customer:users.fullName,customerStatus:users.status,archivedCustomer:deletedCustomerArchives.fullName,recipientName:invoiceRequests.recipientName,street:invoiceRequests.street,postalCode:invoiceRequests.postalCode,city:invoiceRequests.city,email:invoiceRequests.email,eventName:events.name,eventDate:events.eventDate,helperLimit:events.helperLimit,amount:invoiceRequests.amountCents,currency:events.currency,id:invoiceRequests.id}).from(invoiceRequests).innerJoin(events,eq(invoiceRequests.eventId,events.id)).innerJoin(users,eq(events.ownerUserId,users.id)).leftJoin(deletedCustomerArchives,eq(deletedCustomerArchives.sourceUserId,users.id)).where(and(gte(invoiceRequests.createdAt,start),lt(invoiceRequests.createdAt,end)));
 const header=["Buchungsdatum","Buchungszeit","Kunde / Ansprechpartner","Organisation / Rechnungsempfänger","Straße und Hausnummer","PLZ","Ort","Rechnungs-E-Mail","Gebuchte Leistung","Eventname","Eventdatum","Nettobetrag EUR","USt.-Satz","USt.-Betrag EUR","Bruttobetrag EUR","Währung","Vorgangs-ID"],lines=[header.map(cell).join(";")];
 const dateFormatter=new Intl.DateTimeFormat("de-DE",{timeZone:"Europe/Berlin",day:"2-digit",month:"2-digit",year:"numeric"}),timeFormatter=new Intl.DateTimeFormat("de-DE",{timeZone:"Europe/Berlin",hour:"2-digit",minute:"2-digit",second:"2-digit"});
 for(const row of rows){const net=Math.round(row.amount/1.19),vat=row.amount-net,customer=row.customerStatus==="deleted"&&row.archivedCustomer?row.archivedCustomer:row.customer;lines.push([dateFormatter.format(row.createdAt),timeFormatter.format(row.createdAt),customer,row.recipientName,row.street,row.postalCode,row.city,row.email,`RescueEd Alert Event-Paket bis ${row.helperLimit} Helfer`,row.eventName,row.eventDate,money(net),"19 %",money(vat),money(row.amount),row.currency,row.id].map(cell).join(";"))}
 return new Response("\uFEFF"+lines.join("\r\n"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="rescueed-buchungen-${month}.csv"`,"cache-control":"no-store"}});
}
