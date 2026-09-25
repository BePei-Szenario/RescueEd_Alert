import {currentRegistrationDocuments} from "@/lib/legal-registration";
import {legalPdfUrl} from "@/lib/legal-document-file";

export async function GET(){
 try{
  const documents=await currentRegistrationDocuments();
  if(!documents)return Response.json({error:"Die Registrierung ist erst möglich, wenn AGB, Datenschutzerklärung, AVV und SLA veröffentlicht sind."},{status:503,headers:{"cache-control":"no-store"}});
  return Response.json({documents:documents.map(({id,documentKey,title,version,content,contentHash,pdfFileName})=>({id,documentKey,title,version,content,contentHash,pdfFileName,pdfUrl:pdfFileName?legalPdfUrl(documentKey,id):null}))},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("registration_legal_read_failed",error);return Response.json({error:"Rechtstexte konnten nicht geladen werden."},{status:503,headers:{"cache-control":"no-store"}})}
}
