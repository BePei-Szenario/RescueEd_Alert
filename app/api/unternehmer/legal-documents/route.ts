import {and,eq,isNull,ne} from "drizzle-orm";
import {getDb} from "@/db";
import {auditLogs,legalDocuments,legalDocumentVersions} from "@/db/schema";
import {isPdf,legalDocumentHash,MAX_LEGAL_PDF_BYTES,pdfHash,safePdfFileName} from "@/lib/legal-document-file";
import {legalDocumentDefaults,type LegalDocumentKey} from "@/lib/legal-documents";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
  const form=await request.formData();
  const documentKey=String(form.get("documentKey")||"") as LegalDocumentKey;
  const title=String(form.get("title")||"").trim(),version=String(form.get("version")||"").trim();
  const submittedContent=String(form.get("content")||"").trim(),status=String(form.get("status")||"") as "draft"|"published";
  if(!(documentKey in legalDocumentDefaults)||!title||!version||!["draft","published"].includes(status))return Response.json({error:"Bitte Dokument, Titel, Version und Status ausfüllen."},{status:400});
  if(title.length>200||version.length>40||submittedContent.length>100000)return Response.json({error:"Ein Dokumentfeld ist zu lang."},{status:400});
  const db=getDb(),[prior]=await db.select().from(legalDocuments).where(eq(legalDocuments.documentKey,documentKey)).limit(1);
  const upload=form.get("pdf"),removePdf=form.get("removePdf")==="true";
  let pdfData:Buffer|null=removePdf?null:(prior?.pdfData??null),pdfFileName:string|null=removePdf?null:(prior?.pdfFileName??null);
  if(upload instanceof File&&upload.size){
   if(upload.size>MAX_LEGAL_PDF_BYTES)return Response.json({error:"Die PDF-Datei darf höchstens 8 MB groß sein."},{status:413});
   const data=Buffer.from(await upload.arrayBuffer());
   if(!isPdf(data))return Response.json({error:"Die hochgeladene Datei ist keine gültige PDF-Datei."},{status:400});
   pdfData=data;pdfFileName=safePdfFileName(upload.name);
  }
  if(!submittedContent&&!pdfData)return Response.json({error:"Bitte Text eingeben oder eine PDF-Datei hochladen."},{status:400});
  const content=submittedContent||"Die maßgebliche Fassung dieses Dokuments steht als PDF zur Verfügung.";
  const currentPdfHash=pdfData?await pdfHash(pdfData):null,now=new Date(),hash=await legalDocumentHash(content,pdfData);
  if(prior?.status==="published"){
   const priorHash=await legalDocumentHash(prior.content,prior.pdfData);
   await db.insert(legalDocumentVersions).values({id:id("ldv"),documentKey,title:prior.title,version:prior.version,content:prior.content,pdfData:prior.pdfData,pdfFileName:prior.pdfFileName,pdfHash:prior.pdfHash||(prior.pdfData?await pdfHash(prior.pdfData):null),contentHash:priorHash,publishedAt:prior.updatedAt,createdAt:prior.updatedAt}).onConflictDoNothing();
  }
  const [priorVersion]=await db.select().from(legalDocumentVersions).where(and(eq(legalDocumentVersions.documentKey,documentKey),eq(legalDocumentVersions.version,version))).limit(1);
  if(priorVersion&&(priorVersion.contentHash!==hash||priorVersion.content!==content||priorVersion.title!==title||priorVersion.pdfHash!==currentPdfHash||priorVersion.pdfFileName!==pdfFileName||priorVersion.archivedAt))return Response.json({error:"Eine veröffentlichte Versionsnummer ist unveränderlich. Bitte eine neue Versionsnummer vergeben."},{status:409});
  const statements=[];
  if(status==="published"&&!priorVersion){
   statements.push(db.update(legalDocumentVersions).set({archivedAt:now}).where(and(eq(legalDocumentVersions.documentKey,documentKey),isNull(legalDocumentVersions.archivedAt),ne(legalDocumentVersions.version,version))));
   statements.push(db.insert(legalDocumentVersions).values({id:id("ldv"),documentKey,title,version,content,pdfData,pdfFileName,pdfHash:currentPdfHash,contentHash:hash,publishedAt:now,createdAt:now}));
  }
  statements.push(db.insert(legalDocuments).values({documentKey,title,version,content,pdfData,pdfFileName,pdfHash:currentPdfHash,status,updatedByUserId:auth.user!.id,updatedAt:now}).onConflictDoUpdate({target:legalDocuments.documentKey,set:{title,version,content,pdfData,pdfFileName,pdfHash:currentPdfHash,status,updatedByUserId:auth.user!.id,updatedAt:now}}));
  statements.push(db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:status==="published"?"legal_document.published":"legal_document.draft_saved",entityType:"legal_document",entityId:documentKey,metadataJson:JSON.stringify({version,status,contentHash:hash,pdfHash:currentPdfHash,pdfFileName}),createdAt:now}));
  await db.batch(statements as [typeof statements[number],...typeof statements[number][]]);
  return Response.json({ok:true,updatedAt:now.toISOString()});
 }catch(error){console.error("legal_document_save_failed",error);return Response.json({error:"Rechtstext konnte nicht gespeichert werden."},{status:500})}
}
