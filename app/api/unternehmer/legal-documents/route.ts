import {and,eq,isNull,ne} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,legalDocuments,legalDocumentVersions} from "@/db/schema";
import {legalDocumentDefaults,type LegalDocumentKey} from "@/lib/legal-documents";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id,tokenHash} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
  const body=await request.json() as {documentKey?:LegalDocumentKey;title?:string;version?:string;content?:string;status?:"draft"|"published"};
  if(!body.documentKey||!(body.documentKey in legalDocumentDefaults)||!body.title?.trim()||!body.version?.trim()||!body.content?.trim()||!["draft","published"].includes(body.status||""))return Response.json({error:"Bitte alle Dokumentfelder ausfüllen."},{status:400});
  const documentKey=body.documentKey,title=body.title.trim(),version=body.version.trim(),content=body.content.trim(),status=body.status as "draft"|"published";
  if(title.length>200||version.length>40||content.length>100000)return Response.json({error:"Ein Dokumentfeld ist zu lang."},{status:400});
  const now=new Date(),db=getDb(),hash=await tokenHash(content);
  const [prior]=await db.select().from(legalDocuments).where(eq(legalDocuments.documentKey,documentKey)).limit(1);
  if(prior?.status==="published"){
   const priorHash=await tokenHash(prior.content);
   await db.insert(legalDocumentVersions).values({id:id("ldv"),documentKey,title:prior.title,version:prior.version,content:prior.content,contentHash:priorHash,publishedAt:prior.updatedAt,createdAt:prior.updatedAt}).onConflictDoNothing();
  }
  const [priorVersion]=await db.select().from(legalDocumentVersions).where(and(eq(legalDocumentVersions.documentKey,documentKey),eq(legalDocumentVersions.version,version))).limit(1);
  if(priorVersion&&(priorVersion.contentHash!==hash||priorVersion.content!==content||priorVersion.title!==title||priorVersion.archivedAt))return Response.json({error:"Eine veröffentlichte Versionsnummer ist unveränderlich. Bitte eine neue Versionsnummer vergeben."},{status:409});
  const statements=[];
  if(status==="published"&&!priorVersion){
   statements.push(db.update(legalDocumentVersions).set({archivedAt:now}).where(and(eq(legalDocumentVersions.documentKey,documentKey),isNull(legalDocumentVersions.archivedAt),ne(legalDocumentVersions.version,version))));
   statements.push(db.insert(legalDocumentVersions).values({id:id("ldv"),documentKey,title,version,content,contentHash:hash,publishedAt:now,createdAt:now}));
  }
  statements.push(db.insert(legalDocuments).values({documentKey,title,version,content,status,updatedByUserId:auth.user!.id,updatedAt:now}).onConflictDoUpdate({target:legalDocuments.documentKey,set:{title,version,content,status,updatedByUserId:auth.user!.id,updatedAt:now}}));
  statements.push(db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:status==="published"?"legal_document.published":"legal_document.draft_saved",entityType:"legal_document",entityId:documentKey,metadataJson:JSON.stringify({version,status,contentHash:hash}),createdAt:now}));
  await db.batch(statements as [typeof statements[number],...typeof statements[number][]]);
  return Response.json({ok:true,updatedAt:now.toISOString()});
 }catch(error){console.error("legal_document_save_failed",error);return Response.json({error:"Rechtstext konnte nicht gespeichert werden."},{status:500})}
}
