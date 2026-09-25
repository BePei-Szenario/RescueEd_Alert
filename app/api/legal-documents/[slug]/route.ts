import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {legalDocuments} from "@/db/schema";
import {legalDocumentDefaults,type LegalDocumentKey} from "@/lib/legal-documents";
import {legalPdfUrl} from "@/lib/legal-document-file";

export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){
 const {slug}=await params,key=slug as LegalDocumentKey,fallback=legalDocumentDefaults[key];
 if(!fallback)return Response.json({error:"Dokument nicht gefunden."},{status:404});
 try{
  const [stored]=await getDb().select({title:legalDocuments.title,version:legalDocuments.version,content:legalDocuments.content,pdfFileName:legalDocuments.pdfFileName,status:legalDocuments.status}).from(legalDocuments).where(eq(legalDocuments.documentKey,key)).limit(1);
  return Response.json(stored?{...stored,pdfUrl:stored.pdfFileName?legalPdfUrl(key):null}:{...fallback,pdfFileName:null,pdfUrl:null,status:"draft"},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("legal_document_read_failed",error);return Response.json({...fallback,status:"draft"},{headers:{"cache-control":"no-store"}})}
}
