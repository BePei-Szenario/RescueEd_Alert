import {getDb} from "@/db";
import {auditLogs,legalDocuments} from "@/db/schema";
import {legalDocumentDefaults,type LegalDocumentKey} from "@/lib/legal-documents";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
  const body=await request.json() as {documentKey?:LegalDocumentKey;title?:string;version?:string;content?:string;status?:"draft"|"published"};
  if(!body.documentKey||!(body.documentKey in legalDocumentDefaults)||!body.title?.trim()||!body.version?.trim()||!body.content?.trim()||!body.status)return Response.json({error:"Bitte alle Dokumentfelder ausfüllen."},{status:400});
  const now=new Date(),db=getDb();
  await db.batch([
   db.insert(legalDocuments).values({documentKey:body.documentKey,title:body.title.trim(),version:body.version.trim(),content:body.content.trim(),status:body.status,updatedByUserId:auth.user!.id,updatedAt:now}).onConflictDoUpdate({target:legalDocuments.documentKey,set:{title:body.title.trim(),version:body.version.trim(),content:body.content.trim(),status:body.status,updatedByUserId:auth.user!.id,updatedAt:now}}),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:"legal_document.updated",entityType:"legal_document",entityId:body.documentKey,metadataJson:JSON.stringify({version:body.version.trim(),status:body.status}),createdAt:now})
  ]);
  return Response.json({ok:true,updatedAt:now.toISOString()});
 }catch(error){console.error("legal_document_save_failed",error);return Response.json({error:"Rechtstext konnte nicht gespeichert werden."},{status:500})}
}
