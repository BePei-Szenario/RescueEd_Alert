import {mkdirSync,writeFileSync} from "node:fs";
import {createEventSummaryPdf} from "../lib/event-summary-pdf.ts";

const generatedAt=new Date("2026-09-15T20:15:00+02:00");
const pdf=createEventSummaryPdf({
 event:{id:"evt-gruene-wiese-2026",name:"Sanitaetsdienst Gruene Wiese",eventDate:"2026-09-15",startTime:"08:00",endTime:"23:00",helperLimit:20,priceCents:599,currency:"EUR",status:"active",createdAt:new Date("2026-09-14T12:30:00+02:00")},
 invoice:{id:"inv-pruefung",recipientName:"Testorganisation",street:"Muehltor 17",postalCode:"99986",city:"Niederdorla",email:"info@rescueed.de",status:"pending"},
 helpers:[
  {firstName:"Hilde",lastName:"Gard",name:"Hilde Gard",qualification:"SanHelfer",registeredAt:new Date("2026-09-15T19:39:00+02:00"),removedAt:new Date("2026-09-15T22:45:00+02:00"),assignmentName:"Tragetrupp"},
  {firstName:"Einsatz",lastName:"Leiter",name:"Einsatz Leiter",qualification:"Einsatzleiter",registeredAt:new Date("2026-09-15T19:40:00+02:00"),removedAt:null,assignmentName:"Tragetrupp"}
 ],
 alarms:[
  {createdAt:new Date("2026-09-15T20:01:00+02:00"),assignmentNames:["Tragetrupp"],message:"Personensuche im Nordbereich"},
  {createdAt:new Date("2026-09-15T20:08:00+02:00"),assignmentNames:["RTW 1/91/1","Tragetrupp"],message:"Unterstuetzung am Haupteingang"}
 ],
 generatedAt
});
mkdirSync("output/pdf",{recursive:true});
writeFileSync("output/pdf/rescueed-eventabschluss-alarmprotokoll-geprueft.pdf",pdf);
