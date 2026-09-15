import QRCode from "qrcode";
import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {events} from "@/db/schema";
import {ownedEvent} from "@/lib/event-access";

export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{
  const {eventId}=await params,{user,event}=await ownedEvent(eventId);
  if(!user)return new Response("Nicht angemeldet",{status:401});
  if(!event)return new Response("Event nicht gefunden",{status:404});
  const kind=new URL(request.url).searchParams.get("kind")==="leave"?"leave":"come",field=kind==="come"?"checkInCode":"checkOutCode";
  let code=event[field];
  if(!code){code=crypto.randomUUID().replaceAll("-","");await getDb().update(events).set(kind==="come"?{checkInCode:code}:{checkOutCode:code}).where(eq(events.id,event.id))}
  const origin=new URL(request.url).origin,target=`${origin}/event-attendance?eventId=${encodeURIComponent(event.id)}&mode=${kind}&code=${encodeURIComponent(code)}`;
  const svg=await QRCode.toString(target,{type:"svg",errorCorrectionLevel:"M",margin:1,width:480,color:{dark:"#071a33",light:"#ffffff"}});
  return new Response(svg,{headers:{"content-type":"image/svg+xml; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'"}});
 }catch(error){console.error("qr_generation_failed",error);return new Response("QR-Code konnte nicht erstellt werden.",{status:500})}
}
