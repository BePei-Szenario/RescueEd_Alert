import {writeFileSync} from "node:fs";
import {createHelperListPdf} from "../lib/helper-list-pdf";

const now=new Date("2026-09-15T17:39:00+02:00");
const pdf=createHelperListPdf({
 event:{id:"evt-pruefung-2026",name:"Sanitaetsdienst Gruene Wiese",eventDate:"2026-09-15",startTime:"08:00",endTime:"23:00"},
 helpers:[
  {firstName:"Hilde",lastName:"Gard",name:"Hilde Gard",qualification:"SanHelfer",registeredAt:now,assignmentName:"Tragetrupp"},
  {firstName:"Einsatz",lastName:"Leiter",name:"Einsatz Leiter",qualification:"Einsatzleiter",registeredAt:now,assignmentName:"Tragetrupp"},
  {firstName:"Max",lastName:"Muster",name:"Max Muster",qualification:"SanHelfer",registeredAt:now,assignmentName:null}
 ],
 generatedAt:now
});
writeFileSync("output/pdf/rescueed-helferliste-geprueft.pdf",pdf);
