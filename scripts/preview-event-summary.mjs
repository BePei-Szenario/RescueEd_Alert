import {mkdir,writeFile} from "node:fs/promises";
import {createEventSummaryPdf} from "../lib/event-summary-pdf.ts";

const sample={
 event:{id:"Nicht im Protokoll",name:"Stadtfest - Musterprotokoll",eventDate:"2026-10-14",endDate:"2026-10-15",startTime:"18:00",endTime:"02:00",helperLimit:100,priceCents:12345,currency:"EUR",status:"active",createdAt:"2026-10-01"},invoice:null,generatedAt:new Date("2026-10-15T06:00:00Z"),
 helpers:Array.from({length:16},(_,i)=>({firstName:"Erika",lastName:`Muster ${i+1}`,name:`Erika Muster ${i+1}`,qualification:i%3?"SanH":"Rettungssanitaeter",registeredAt:"2026-10-14T16:00:00Z",removedAt:"2026-10-15T00:00:00Z",assignmentName:i%2?"RTW 1":"Tragetrupp 2"})),
 noShows:[{firstName:"Max",lastName:"Beispiel",assignmentName:"RTW 2",startAt:"2026-10-14T16:00:00Z",endAt:"2026-10-15T00:00:00Z"},{firstName:"Anna",lastName:"Musterfrau",assignmentName:"Tragetrupp 1",startAt:"2026-10-14T16:00:00Z",endAt:"2026-10-15T00:00:00Z"}],
 alarms:Array.from({length:8},(_,i)=>({createdAt:new Date(Date.UTC(2026,9,14,17,i*5)),assignmentNames:["RTW 1","Tragetrupp 2"],message:i%2?"Patient am Haupteingang. Bitte vor Ort melden.":"Unterstuetzung an der Buehne erforderlich."}))
};
await mkdir("output/pdf",{recursive:true});
await writeFile("output/pdf/eventprotokoll-kompakt-muster.pdf",createEventSummaryPdf(sample));
