import {getDb} from "@/db";
import {auditLogs,legalAcknowledgements} from "@/db/schema";
import {legalReconfirmation} from "@/lib/legal-reconfirmation";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {currentUser} from "@/lib/session";

const noStore={"cache-control":"no-store"};
export async function GET(request:Request){
 const user=await currentUser();if(!user)return Response.json({error:"Bitte zuerst anmelden."},{status:401,headers:noStore});
 if(user.accountType==="consumer"&&request.headers.get("x-rescueed-client")!=="mobile")return Response.json({error:"Privatkonten sind nur in der App zugänglich."},{status:403,headers:noStore});
 try{return Response.json(await legalReconfirmation(user),{headers:noStore})}catch(error){console.error("legal_reconfirmation_read_failed",error);return Response.json({error:"Rechtstexte konnten nicht geladen werden."},{status:503,headers:noStore})}
}

export async function POST(request:Request){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 const user=await currentUser();if(!user)return Response.json({error:"Bitte zuerst anmelden."},{status:401,headers:noStore});
 if(user.accountType==="consumer"&&request.headers.get("x-rescueed-client")!=="mobile")return Response.json({error:"Privatkonten sind nur in der App zugänglich."},{status:403,headers:noStore});
 if(user.role!=="customer")return Response.json({error:"Nur das Hauptkonto kann die Rechtstexte für die Organisation bestätigen."},{status:403,headers:noStore});
 try{
  const body=await request.json() as {acceptedDocumentVersionIds?:unknown};
  const review=await legalReconfirmation(user);
  if(!review.available)return Response.json({error:"Die aktuellen Rechtstexte sind nicht verfügbar."},{status:503,headers:noStore});
  if(!review.required)return Response.json({ok:true,required:false},{headers:noStore});
  const given=body.acceptedDocumentVersionIds;
  if(!Array.isArray(given)||given.length!==review.documents.length||new Set(given).size!==given.length||!review.documents.every(document=>given.includes(document.id)))return Response.json({error:"Bitte alle aktuell erforderlichen Fassungen einzeln öffnen und bestätigen."},{status:400,headers:noStore});
  const now=new Date(),db=getDb();
  const statements=[
   ...review.documents.map(document=>db.insert(legalAcknowledgements).values({id:id("lack"),userId:user.id,organizationId:user.organizationId,documentVersionId:document.id,documentKey:document.documentKey as "agb"|"agb_b2c"|"datenschutz"|"avv"|"sla"|"widerruf",documentVersion:document.version,documentHash:document.contentHash,acknowledgementType:document.acknowledgementType,acceptedAt:now,createdAt:now}).onConflictDoNothing()),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:user.id,action:"legal_documents.reconfirmed",entityType:"user",entityId:user.id,metadataJson:JSON.stringify({versions:review.documents.map(document=>({key:document.documentKey,version:document.version,hash:document.contentHash}))}),createdAt:now})
  ];
  await db.batch(statements as [typeof statements[number],...typeof statements[number][]]);
  return Response.json({ok:true,required:false},{headers:noStore});
 }catch(error){console.error("legal_reconfirmation_failed",error);return Response.json({error:"Bestätigung konnte nicht gespeichert werden."},{status:500,headers:noStore})}
}
