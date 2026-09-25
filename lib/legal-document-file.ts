import {createHash} from "node:crypto";
import {tokenHash} from "@/lib/security";

export const MAX_LEGAL_PDF_BYTES=8*1024*1024;

export async function pdfHash(data:Buffer){
 return createHash("sha256").update(data).digest("hex");
}

export async function legalDocumentHash(content:string,pdfData:Buffer|null|undefined){
 if(!pdfData?.length)return tokenHash(content);
 return tokenHash(`${content}\0pdf:${await pdfHash(pdfData)}`);
}

export function safePdfFileName(value:string){
 const leaf=value.replace(/\\/g,"/").split("/").pop()?.trim()||"rechtstext.pdf";
 const clean=leaf.replace(/[^\p{L}\p{N}._ -]/gu,"_").slice(0,180);
 return clean.toLowerCase().endsWith(".pdf")?clean:`${clean}.pdf`;
}

export function isPdf(data:Buffer){return data.length>=5&&data.subarray(0,5).toString("ascii")==="%PDF-"}

export function legalPdfUrl(documentKey:string,versionId?:string){
 const base=`/api/legal-documents/${encodeURIComponent(documentKey)}/pdf`;
 return versionId?`${base}?versionId=${encodeURIComponent(versionId)}`:base;
}
