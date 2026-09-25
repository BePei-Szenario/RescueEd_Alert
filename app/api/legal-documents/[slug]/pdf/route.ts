import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {legalDocuments,legalDocumentVersions} from "@/db/schema";
import {legalDocumentDefaults,type LegalDocumentKey} from "@/lib/legal-documents";

export async function GET(request:Request,{params}:{params:Promise<{slug:string}>}){
 const {slug}=await params,key=slug as LegalDocumentKey;
 if(!(key in legalDocumentDefaults))return new Response("Nicht gefunden",{status:404});
 const versionId=new URL(request.url).searchParams.get("versionId"),db=getDb();
 const [row]=versionId
  ?await db.select({data:legalDocumentVersions.pdfData,fileName:legalDocumentVersions.pdfFileName}).from(legalDocumentVersions).where(and(eq(legalDocumentVersions.id,versionId),eq(legalDocumentVersions.documentKey,key))).limit(1)
  :await db.select({data:legalDocuments.pdfData,fileName:legalDocuments.pdfFileName}).from(legalDocuments).where(eq(legalDocuments.documentKey,key)).limit(1);
 if(!row?.data)return new Response("PDF nicht vorhanden",{status:404});
 const fileName=(row.fileName||`${key}.pdf`).replace(/["\r\n]/g,"_"),asciiName=fileName.replace(/[^A-Za-z0-9._-]/g,"_");
 return new Response(new Uint8Array(row.data),{headers:{"content-type":"application/pdf","content-disposition":`inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,"content-security-policy":"default-src 'none'; frame-ancestors 'self'","x-frame-options":"SAMEORIGIN","x-content-type-options":"nosniff","cache-control":"private, no-store"}});
}
