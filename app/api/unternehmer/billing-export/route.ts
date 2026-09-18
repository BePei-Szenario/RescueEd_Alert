import {and,gte,lt} from "drizzle-orm";
import {getDb} from "@/db";
import {billingRecords} from "@/db/schema";
import {requirePlatformOwnerApi} from "@/lib/session";
function cell(value:unknown){let text=String(value??"").replace(/\r?\n/g," ");if(/^[=+\-@]/.test(text))text="'"+text;return `"${text.replaceAll('"','""')}"`}
function money(cents:number){return (cents/100).toFixed(2).replace(".",",")}

export async function GET(request:Request){
 const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
 const month=new URL(request.url).searchParams.get("month")||"";
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return Response.json({error:"Monat muss als JJJJ-MM angegeben werden."},{status:400});
 const [year,number]=month.split("-").map(Number),start=new Date(Date.UTC(year,number-1,1)),end=new Date(Date.UTC(year,number,1));
 const rows=await getDb().select().from(billingRecords).where(and(gte(billingRecords.createdAt,start),lt(billingRecords.createdAt,end)));
 const header=["Buchungsdatum","Buchungszeit","Kunde / Ansprechpartner","Organisation / Rechnungsempfänger","Straße und Hausnummer","PLZ","Ort","Rechnungs-E-Mail","Gebuchte Leistung","Eventname","Eventdatum","Nettobetrag EUR","USt.-Satz","USt.-Betrag EUR","Bruttobetrag EUR","Währung","Vorgangs-ID"],lines=[header.map(cell).join(";")];
 const dateFormatter=new Intl.DateTimeFormat("de-DE",{timeZone:"Europe/Berlin",day:"2-digit",month:"2-digit",year:"numeric"}),timeFormatter=new Intl.DateTimeFormat("de-DE",{timeZone:"Europe/Berlin",hour:"2-digit",minute:"2-digit",second:"2-digit"});
 for(const row of rows){const net=Math.round(row.amountCents/1.19),vat=row.amountCents-net;lines.push([dateFormatter.format(row.createdAt),timeFormatter.format(row.createdAt),row.customerName,row.recipientName,row.street,row.postalCode,row.city,row.email,`RescueEd Alert Event-Paket bis ${row.helperLimit} Helfer`,row.eventName,row.eventDate,money(net),"19 %",money(vat),money(row.amountCents),row.currency,row.id].map(cell).join(";"))}
 return new Response("\uFEFF"+lines.join("\r\n"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="rescueed-buchungen-${month}.csv"`,"cache-control":"no-store"}});
}
