import assert from "node:assert/strict";
import test from "node:test";
import {createEventSummaryPdf} from "../lib/event-summary-pdf.ts";

export function summaryFixture(count=20){return {
 event:{id:"INTERNAL-EVENT-SECRET",name:"Stadtfest - Musterprotokoll",eventDate:"2026-10-14",endDate:"2026-10-15",startTime:"18:00",endTime:"02:00",helperLimit:99,priceCents:12345,currency:"EUR",status:"active",createdAt:"2026-10-01"},
 invoice:{id:"INVOICE-SECRET",recipientName:"BILLING-SECRET",street:"PRIVATE-STREET",postalCode:"12345",city:"PRIVATE-CITY",email:"private@example.test",status:"paid"},
 generatedAt:new Date("2026-10-15T06:00:00Z"),
 helpers:Array.from({length:count},(_,i)=>({firstName:"Erika",lastName:`Muster ${i+1}`,name:`Erika Muster ${i+1}`,qualification:i%3?"SanH":"Rettungssanitaeter",registeredAt:"2026-10-14T16:00:00Z",removedAt:"2026-10-15T00:00:00Z",assignmentName:i%2?"RTW 1":"Tragetrupp 2"})),
 alarms:Array.from({length:8},(_,i)=>({createdAt:new Date(Date.UTC(2026,9,14,17,i*5)),assignmentNames:["RTW 1","Tragetrupp 2"],message:i%2?"Patient am Haupteingang. Bitte vor Ort melden.":"Unterstuetzung an der Buehne erforderlich."}))
};}

test("summary excludes billing and booking details but keeps operational records",()=>{
 const pdf=Buffer.from(createEventSummaryPdf(summaryFixture())).toString();
 for(const secret of ["INTERNAL-EVENT-SECRET","INVOICE-SECRET","BILLING-SECRET","PRIVATE-STREET","PRIVATE-CITY","private@example.test","Eventnummer","Rechnungsdaten","Bestellt am","Buchung","123.45","Status bei"]){assert.ok(!pdf.includes(secret),secret)}
 for(const label of ["Helferverlauf","Alarmprotokoll","Muster 20","14.10.2026 18:00","15.10.2026 02:00","14.10.2026 19:00 Uhr"]){assert.ok(pdf.includes(label),label)}
 assert.equal((pdf.match(/\/Type \/Page /g)||[]).length,1,"20 helpers and 8 short alarms should fit on one page");
});
test("large reports repeat table headings and retain every helper",()=>{
 const pdf=Buffer.from(createEventSummaryPdf(summaryFixture(75))).toString();
 assert.ok((pdf.match(/\/Type \/Page /g)||[]).length>1);
 assert.ok(pdf.includes("Helferverlauf - Fortsetzung"));assert.ok(pdf.includes("Muster 75"));
 assert.ok(pdf.includes("Alarmprotokoll"));
});
test("empty reports keep both protocol sections",()=>{
 const fixture=summaryFixture(0);fixture.alarms=[];
 const pdf=Buffer.from(createEventSummaryPdf(fixture)).toString();
 assert.ok(pdf.includes("Keine Helfer erfasst."));assert.ok(pdf.includes("Keine Alarmierungen protokolliert."));
});

test("missed services have their own compact section including overnight times",()=>{
 const input=summaryFixture(2);
 input.noShows=[{firstName:"Max",lastName:"Fehlt",assignmentName:"RTW 2",startAt:"2026-10-14T16:00:00Z",endAt:"2026-10-15T00:00:00Z"}];
 const pdf=Buffer.from(createEventSummaryPdf(input)).toString();
 for(const label of ["Dienst nicht angetreten","Fehlt, Max","RTW 2","Geplant von","Geplant bis","15.10.2026 02:00"]){assert.ok(pdf.includes(label),label)}
 assert.ok(!Buffer.from(createEventSummaryPdf(summaryFixture(0))).toString().includes("Dienst nicht angetreten"));
});
