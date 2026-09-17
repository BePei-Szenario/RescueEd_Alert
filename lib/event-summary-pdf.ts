import {effectiveEventEndDate} from "./event-duration";

type EventSummary={
 event:{id:string;name:string;eventDate:string;endDate?:string|null;startTime:string|null;endTime:string|null;helperLimit:number;priceCents:number;currency:string;status:string;createdAt:Date|string};
 invoice:{id:string;recipientName:string;street:string;postalCode:string;city:string;email:string;status:string}|null;
 helpers:Array<{firstName:string|null;lastName:string|null;name:string;qualification:string;registeredAt:Date|string;removedAt:Date|string|null;assignmentName:string|null}>;
 alarms?:Array<{createdAt:Date|string;assignmentNames:string[];message:string|null}>;
 generatedAt?:Date;
};

const PAGE_W=595,PAGE_H=842,MARGIN=42;
const BLUE=[0.04,0.16,0.29] as const,ACCENT=[0.08,0.42,0.91] as const,INK=[0.08,0.13,0.22] as const,MUTED=[0.38,0.45,0.55] as const,LIGHT=[0.93,0.96,0.99] as const;

function safe(value:unknown){return String(value??"").replace(/[äÄ]/g,"ae").replace(/[öÖ]/g,"oe").replace(/[üÜ]/g,"ue").replace(/ß/g,"ss").replace(/[–—]/g,"-").replace(/[^ -~]/g," ").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)")}
function date(value:Date|string){return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(value))}
function time(value:Date|string|null){return value?new Intl.DateTimeFormat("de-DE",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Berlin"}).format(new Date(value)):"-"}
function wrap(value:string,max:number){const words=safe(value).split(/\s+/),lines:string[]=[];let line="";for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>max&&line){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines.length?lines:[""]}
function text(value:string,x:number,y:number,size=10,bold=false,color:readonly number[]=INK){return `BT /F${bold?2:1} ${size} Tf ${color[0]} ${color[1]} ${color[2]} rg 1 0 0 1 ${x} ${y} Tm (${safe(value)}) Tj ET`}
function rect(x:number,y:number,w:number,h:number,color:readonly number[]){return `${color[0]} ${color[1]} ${color[2]} rg ${x} ${y} ${w} ${h} re f`}
function line(x1:number,y1:number,x2:number,y2:number,color:readonly number[]=[.82,.87,.92]){return `${color[0]} ${color[1]} ${color[2]} RG .6 w ${x1} ${y1} m ${x2} ${y2} l S`}

export function createEventSummaryPdf(input:EventSummary){
 const pages:string[][]=[];let page:string[]=[],y=PAGE_H-MARGIN;
 const newPage=()=>{if(page.length)pages.push(page);page=[];y=PAGE_H-MARGIN;const titleSize=Math.max(11,Math.min(18,520/Math.max(1,safe(input.event.name).length*.55)));page.push(rect(0,PAGE_H-92,PAGE_W,92,BLUE),text(input.event.name,MARGIN,PAGE_H-48,titleSize,true,[1,1,1]),text("Eventabschluss und Anwesenheitsnachweis",MARGIN,PAGE_H-70,9,false,[.72,.84,.98]));y=PAGE_H-122};
 const ensure=(height:number)=>{if(y-height<58)newPage()};
 const labelValue=(label:string,value:string)=>{ensure(34);page.push(text(label,MARGIN,y,8,true,MUTED),text(value,MARGIN+122,y,10,true,INK));y-=25};
 const section=(title:string)=>{ensure(42);page.push(rect(MARGIN,y-23,PAGE_W-MARGIN*2,30,LIGHT),rect(MARGIN,y-23,4,30,ACCENT),text(title,MARGIN+14,y-12,12,true,BLUE));y-=45};
 newPage();
 page.push(text(`Erstellt am ${date(input.generatedAt||new Date())}`,MARGIN,y,9,false,MUTED));y-=36;
 section("Eventdetails");
 labelValue("Eventnummer",input.event.id);labelValue("Eventzeit",`${date(input.event.eventDate)} ${input.event.startTime||"-"} bis ${date(effectiveEventEndDate(input.event.eventDate,input.event.startTime,input.event.endDate,input.event.endTime))} ${input.event.endTime||"-"} Uhr`);labelValue("Bestellt am",date(input.event.createdAt));labelValue("Buchung",`Bis ${input.event.helperLimit} Helfer | ${(input.event.priceCents/100).toFixed(2)} ${input.event.currency}`);labelValue("Status bei Loeschung",input.event.status);
 section("Rechnungsdaten");
 if(input.invoice){labelValue("Empfaenger",input.invoice.recipientName);labelValue("Anschrift",`${input.invoice.street}, ${input.invoice.postalCode} ${input.invoice.city}`);labelValue("E-Mail",input.invoice.email);labelValue("Vorgang",`${input.invoice.id} | ${input.invoice.status}`)}else{page.push(text("Keine Rechnungsdaten vorhanden.",MARGIN,y,10));y-=28}
 section("Helferverlauf");
 const cols=[MARGIN,MARGIN+148,MARGIN+265,MARGIN+337,MARGIN+409],widths=[144,113,68,68,102];
 const header=()=>{ensure(34);page.push(rect(MARGIN,y-23,PAGE_W-MARGIN*2,28,BLUE));["Helfer","Qualifikation","Kommen","Gehen","Sanitaetsmittel"].forEach((v,i)=>page.push(text(v,cols[i]+5,y-13,7,true,[1,1,1])));y-=30};
 header();
 if(!input.helpers.length){page.push(text("Keine Helfer erfasst.",MARGIN+7,y-15,9));y-=32}
 for(const helper of input.helpers){
  const helperName=helper.lastName?`${helper.lastName}, ${helper.firstName||""}`:helper.name;
  const cells=[helperName,helper.qualification,time(helper.registeredAt),time(helper.removedAt),helper.assignmentName||"Nicht eingeteilt"];
  const wrapped=cells.map((cell,i)=>wrap(cell,Math.max(8,Math.floor(widths[i]/5.5))));const height=Math.max(34,wrapped.reduce((m,c)=>Math.max(m,c.length),1)*10+14);
  if(y-height<58){newPage();section("Helferverlauf - Fortsetzung");header()}
  page.push(rect(MARGIN,y-height+4,PAGE_W-MARGIN*2,height,y%2?LIGHT:[1,1,1]));
  cells.forEach((_,i)=>wrapped[i].forEach((value,row)=>page.push(text(value,cols[i]+5,y-11-row*10,7.5,i===0,INK))));
  for(let i=1;i<cols.length;i++)page.push(line(cols[i],y+4,cols[i],y-height+4));page.push(line(MARGIN,y-height+4,PAGE_W-MARGIN,y-height+4));y-=height;
 }
 section("Alarmprotokoll");
 const alarmCols=[MARGIN,MARGIN+92,MARGIN+280],alarmWidths=[88,184,231];
 const alarmHeader=()=>{ensure(34);page.push(rect(MARGIN,y-23,PAGE_W-MARGIN*2,28,BLUE));["Alarmiert um","Sanitaetsmittel","Alarmmeldung"].forEach((value,index)=>page.push(text(value,alarmCols[index]+5,y-13,7,true,[1,1,1])));y-=30};
 alarmHeader();
 if(!input.alarms?.length){page.push(text("Keine Alarmierungen protokolliert.",MARGIN+7,y-15,9));y-=32}
 for(const alarm of input.alarms||[]){const cells=[`${date(alarm.createdAt)}, ${time(alarm.createdAt)} Uhr`,alarm.assignmentNames.join(", "),alarm.message||"Ohne zusaetzliche Meldung"],wrapped=cells.map((cell,index)=>wrap(cell,Math.max(8,Math.floor(alarmWidths[index]/5.5)))),height=Math.max(34,wrapped.reduce((maximum,cell)=>Math.max(maximum,cell.length),1)*10+14);if(y-height<58){newPage();section("Alarmprotokoll - Fortsetzung");alarmHeader()}page.push(rect(MARGIN,y-height+4,PAGE_W-MARGIN*2,height,y%2?LIGHT:[1,1,1]));wrapped.forEach((cell,index)=>cell.forEach((value,row)=>page.push(text(value,alarmCols[index]+5,y-11-row*10,7.5,index===1,INK))));for(let index=1;index<alarmCols.length;index++)page.push(line(alarmCols[index],y+4,alarmCols[index],y-height+4));page.push(line(MARGIN,y-height+4,PAGE_W-MARGIN,y-height+4));y-=height}
 pages.push(page);
 pages.forEach((commands,index)=>{commands.push(line(MARGIN,42,PAGE_W-MARGIN,42),text("RescueEd - Email: info@rescueed.de - Telefon: /49 3601/ 80 80 191",MARGIN,26,7,false,MUTED),text(`Seite ${index+1} von ${pages.length}`,PAGE_W-MARGIN-62,26,7,false,MUTED))});
 const objects:string[]=["<< /Type /Catalog /Pages 2 0 R >>","", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
 const kids:number[]=[];
 for(const commands of pages){const pageId=objects.length+1,contentId=pageId+1,kidsIndex=pageId;kids.push(kidsIndex);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);const content=commands.join("\n");objects.push(`<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`)}
 objects[1]=`<< /Type /Pages /Kids [${kids.map(id=>`${id} 0 R`).join(" ")}] /Count ${kids.length} >>`;
 let pdf="%PDF-1.4\n%RescueEd\n",offsets=[0];objects.forEach((object,index)=>{offsets.push(new TextEncoder().encode(pdf).length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`});const xref=new TextEncoder().encode(pdf).length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new TextEncoder().encode(pdf);
}
