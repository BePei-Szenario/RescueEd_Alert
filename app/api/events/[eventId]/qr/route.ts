import QRCode from "qrcode";
import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {events} from "@/db/schema";
import {eventAuthenticated,ownedEvent} from "@/lib/event-access";

export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{
  const {eventId}=await params,authorization=await ownedEvent(eventId),{event,permissions}=authorization;
  if(!eventAuthenticated(authorization))return new Response("Nicht angemeldet",{status:401});
  if(!event)return new Response("Event nicht gefunden",{status:404});
  if(!permissions?.viewQr)return new Response("Dieser Event-Zugang darf keine Anwesenheits-QR-Codes öffnen",{status:403});
  const query=new URL(request.url),kind=query.searchParams.get("kind")==="leave"?"leave":"come",field=kind==="come"?"checkInCode":"checkOutCode";
  let code=event[field];
  if(!code){code=crypto.randomUUID().replaceAll("-","");await getDb().update(events).set(kind==="come"?{checkInCode:code}:{checkOutCode:code}).where(eq(events.id,event.id))}
  const origin=new URL(request.url).origin,target=`${origin}/event-attendance?eventId=${encodeURIComponent(event.id)}&mode=${kind}&code=${encodeURIComponent(code)}`;
  const svg=await QRCode.toString(target,{type:"svg",errorCorrectionLevel:"M",margin:1,width:480,color:{dark:"#071a33",light:"#ffffff"}});
  const headers:Record<string,string>={"content-type":"image/svg+xml; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'","x-content-type-options":"nosniff"};
  if(query.searchParams.get("download")==="1")headers["content-disposition"]=`attachment; filename="rescueed-qr-${kind}-${event.id.replace(/[^a-zA-Z0-9_-]/g,"")}.svg"`;
  return new Response(svg,{headers});
 }catch(error){console.error("qr_generation_failed",error);return new Response("QR-Code konnte nicht erstellt werden.",{status:500})}
}
