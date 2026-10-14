import {effectiveEventEndDate} from "./event-duration.ts";

type EventSummary={
 event:{id:string;name:string;eventDate:string;endDate?:string|null;startTime:string|null;endTime:string|null;helperLimit:number;priceCents:number;currency:string;status:string;createdAt:Date|string};
 invoice:{id:string;recipientName:string;street:string;postalCode:string;city:string;email:string;status:string}|null;
 helpers:Array<{firstName:string|null;lastName:string|null;name:string;qualification:string;registeredAt:Date|string;removedAt:Date|string|null;assignmentName:string|null}>;
 alarms?:Array<{createdAt:Date|string;assignmentNames:string[];message:string|null}>;
 noShows?:Array<{firstName:string;lastName:string;assignmentName:string;startAt:Date|string;endAt:Date|string}>;
 generatedAt?:Date;
};

const PAGE_W=595,PAGE_H=842,MARGIN=42;
const BLUE=[0.04,0.16,0.29] as const,ACCENT=[0.08,0.42,0.91] as const,INK=[0.08,0.13,0.22] as const,MUTED=[0.38,0.45,0.55] as const,LIGHT=[0.93,0.96,0.99] as const;

function safe(value:unknown){return String(value??"").replace(/[äÄ]/g,"ae").replace(/[öÖ]/g,"oe").replace(/[üÜ]/g,"ue").replace(/ß/g,"ss").replace(/[–—]/g,"-").replace(/[^ -~]/g," ").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)")}
function date(value:Date|string){return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(value))}
function time(value:Date|string|null){return value?new Intl.DateTimeFormat("de-DE",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Berlin"}).format(new Date(value)):"-"}
function wrap(value:string,max:number){const words=String(value).replace(/[äÄ]/g,"ae").replace(/[öÖ]/g,"oe").replace(/[üÜ]/g,"ue").replace(/ß/g,"ss").split(/\s+/).flatMap(word=>word.match(new RegExp(`.{1,${max}}`,"g"))||[]),lines:string[]=[];let line="";for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>max&&line){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines.length?lines:[""]}
function text(value:string,x:number,y:number,size=10,bold=false,color:readonly number[]=INK){return `BT /F${bold?2:1} ${size} Tf ${color[0]} ${color[1]} ${color[2]} rg 1 0 0 1 ${x} ${y} Tm (${safe(value)}) Tj ET`}
function rect(x:number,y:number,w:number,h:number,color:readonly number[]){return `${color[0]} ${color[1]} ${color[2]} rg ${x} ${y} ${w} ${h} re f`}
function line(x1:number,y1:number,x2:number,y2:number,color:readonly number[]=[.82,.87,.92]){return `${color[0]} ${color[1]} ${color[2]} RG .6 w ${x1} ${y1} m ${x2} ${y2} l S`}

export function createEventSummaryPdf(input:EventSummary){
 const pages:string[][]=[];let page:string[]=[],y=PAGE_H-MARGIN;
 const newPage=()=>{if(page.length)pages.push(page);page=[];y=PAGE_H-MARGIN;const titleSize=Math.max(11,Math.min(18,520/Math.max(1,safe(input.event.name).length*.55)));page.push(rect(0,PAGE_H-70,PAGE_W,70,BLUE),text(input.event.name,MARGIN,PAGE_H-32,titleSize,true,[1,1,1]),text("Helfer- und Alarmprotokoll",MARGIN,PAGE_H-52,9,false,[.72,.84,.98]));y=PAGE_H-92};
 const ensure=(height:number)=>{if(y-height<58)newPage()};
 const section=(title:string)=>{ensure(68);page.push(rect(MARGIN,y-18,PAGE_W-MARGIN*2,23,LIGHT),rect(MARGIN,y-18,3,23,ACCENT),text(title,MARGIN+10,y-10,10,true,BLUE));y-=29};
 newPage();
 page.push(text(`Erstellt am ${date(input.generatedAt||new Date())}`,MARGIN,y,9,false,MUTED));y-=16;
 page.push(text(`Eventzeit: ${date(input.event.eventDate)} ${input.event.startTime||"-"} bis ${date(effectiveEventEndDate(input.event.eventDate,input.event.startTime,input.event.endDate,input.event.endTime))} ${input.event.endTime||"-"} Uhr`,MARGIN,y,9,true));y-=24;
 section("Helferverlauf");
 const cols=[MARGIN,MARGIN+110,MARGIN+216,MARGIN+312,MARGIN+408],widths=[100,96,86,86,93];
 const header=()=>{ensure(40);page.push(rect(MARGIN,y-17,PAGE_W-MARGIN*2,21,BLUE));["Helfer","Qualifikation","Kommen","Gehen","Einsatzmittel"].forEach((v,i)=>page.push(text(v,cols[i]+5,y-10,7,true,[1,1,1])));y-=24};
 header();
 if(!input.helpers.length){page.push(text("Keine Helfer erfasst.",MARGIN+7,y-15,9));y-=22}
 for(const [helperIndex,helper] of input.helpers.entries()){
  const helperName=helper.lastName?`${helper.lastName}, ${helper.firstName||""}`:helper.name;
  const cells=[helperName,helper.qualification,`${date(helper.registeredAt)} ${time(helper.registeredAt)}`,helper.removedAt?`${date(helper.removedAt)} ${time(helper.removedAt)}`:"-",helper.assignmentName||"Nicht eingeteilt"];
  const wrapped=cells.map((cell,i)=>wrap(cell,Math.max(8,Math.floor(widths[i]/4.8))));const height=Math.max(18,wrapped.reduce((m,c)=>Math.max(m,c.length),1)*9+8);
  if(y-height<58){newPage();section("Helferverlauf - Fortsetzung");header()}
  page.push(rect(MARGIN,y-height,PAGE_W-MARGIN*2,height,helperIndex%2?[1,1,1]:LIGHT));
  cells.forEach((_,i)=>wrapped[i].forEach((value,row)=>page.push(text(value,cols[i]+5,y-11-row*9,7.5,i===0,INK))));
  for(let i=1;i<cols.length;i++)page.push(line(cols[i],y,cols[i],y-height));page.push(line(MARGIN,y-height,PAGE_W-MARGIN,y-height));y-=height;
 }
 y-=10;section("Alarmprotokoll");
 const alarmCols=[MARGIN,MARGIN+115,MARGIN+265],alarmWidths=[105,140,236];
 const alarmHeader=()=>{ensure(40);page.push(rect(MARGIN,y-17,PAGE_W-MARGIN*2,21,BLUE));["Alarmiert um","Einsatzmittel","Alarmmeldung"].forEach((value,index)=>page.push(text(value,alarmCols[index]+5,y-10,7,true,[1,1,1])));y-=24};
 alarmHeader();
 if(!input.alarms?.length){page.push(text("Keine Alarmierungen protokolliert.",MARGIN+7,y-15,9));y-=22}
 for(const [alarmIndex,alarm] of (input.alarms||[]).entries()){const cells=[`${date(alarm.createdAt)} ${time(alarm.createdAt)} Uhr`,alarm.assignmentNames.join(", "),alarm.message||"Ohne zusaetzliche Meldung"],wrapped=cells.map((cell,index)=>wrap(cell,Math.max(8,Math.floor(alarmWidths[index]/4.8)))),height=Math.max(18,wrapped.reduce((maximum,cell)=>Math.max(maximum,cell.length),1)*9+8);if(y-height<58){newPage();section("Alarmprotokoll - Fortsetzung");alarmHeader()}page.push(rect(MARGIN,y-height,PAGE_W-MARGIN*2,height,alarmIndex%2?[1,1,1]:LIGHT));wrapped.forEach((cell,index)=>cell.forEach((value,row)=>page.push(text(value,alarmCols[index]+5,y-11-row*9,7.5,index===1,INK))));for(let index=1;index<alarmCols.length;index++)page.push(line(alarmCols[index],y,alarmCols[index],y-height));page.push(line(MARGIN,y-height,PAGE_W-MARGIN,y-height));y-=height}
 if(input.noShows?.length){
  y-=10;section("Dienst nicht angetreten");
  const noShowCols=[MARGIN,MARGIN+150,MARGIN+291,MARGIN+401],noShowWidths=[140,131,100,100];
  const noShowHeader=()=>{ensure(40);page.push(rect(MARGIN,y-17,PAGE_W-MARGIN*2,21,BLUE));["Helfer","Einsatzmittel","Geplant von","Geplant bis"].forEach((value,index)=>page.push(text(value,noShowCols[index]+5,y-10,7,true,[1,1,1])));y-=24};
  noShowHeader();
  for(const [index,person] of input.noShows.entries()){
   const cells=[`${person.lastName}, ${person.firstName}`,person.assignmentName,`${date(person.startAt)} ${time(person.startAt)}`,`${date(person.endAt)} ${time(person.endAt)}`],wrapped=cells.map((cell,column)=>wrap(cell,Math.floor(noShowWidths[column]/4.8))),height=Math.max(18,Math.max(...wrapped.map(cell=>cell.length))*9+8);
   if(y-height<58){newPage();section("Dienst nicht angetreten - Fortsetzung");noShowHeader()}
   page.push(rect(MARGIN,y-height,PAGE_W-MARGIN*2,height,index%2?[1,1,1]:LIGHT));
   wrapped.forEach((cell,column)=>cell.forEach((value,row)=>page.push(text(value,noShowCols[column]+5,y-11-row*9,7.5,column===0))));
   for(let column=1;column<noShowCols.length;column++)page.push(line(noShowCols[column],y,noShowCols[column],y-height));
   page.push(line(MARGIN,y-height,PAGE_W-MARGIN,y-height));y-=height;
  }
 }
 pages.push(page);
 pages.forEach((commands,index)=>{commands.push(line(MARGIN,42,PAGE_W-MARGIN,42),text("RescueEd - Email: info@rescueed.de - Telefon: /49 3601/ 80 80 191",MARGIN,26,7,false,MUTED),text(`Seite ${index+1} von ${pages.length}`,PAGE_W-MARGIN-62,26,7,false,MUTED))});
 const objects:string[]=["<< /Type /Catalog /Pages 2 0 R >>","", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
 const kids:number[]=[];
 for(const commands of pages){const pageId=objects.length+1,contentId=pageId+1,kidsIndex=pageId;kids.push(kidsIndex);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);const content=commands.join("\n");objects.push(`<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`)}
 objects[1]=`<< /Type /Pages /Kids [${kids.map(id=>`${id} 0 R`).join(" ")}] /Count ${kids.length} >>`;
 let pdf="%PDF-1.4\n%RescueEd\n";const offsets=[0];objects.forEach((object,index)=>{offsets.push(new TextEncoder().encode(pdf).length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`});const xref=new TextEncoder().encode(pdf).length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new TextEncoder().encode(pdf);
}
