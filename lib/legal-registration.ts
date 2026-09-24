import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {legalDocuments,legalDocumentVersions} from "@/db/schema";
import {legalDocumentHash,pdfHash} from "@/lib/legal-document-file";
import {id} from "@/lib/security";

export const REQUIRED_REGISTRATION_DOCUMENTS=["agb","datenschutz","avv","sla"] as const;
export type RegistrationDocumentKey=typeof REQUIRED_REGISTRATION_DOCUMENTS[number];
export type LegalEvidence={documentVersionId:string;documentKey:RegistrationDocumentKey;documentVersion:string;documentHash:string;acknowledgementType:"read"|"accepted"};

// Published snapshots are immutable. Existing installations with a published legacy
// row are imported on first read without altering that row or its content.
export async function currentRegistrationDocuments(){
 const db=getDb();
 const documents=await db.select().from(legalDocuments);
 const result=[];
 for(const documentKey of REQUIRED_REGISTRATION_DOCUMENTS){
  const current=documents.find(x=>x.documentKey===documentKey);
  if(!current||current.status!=="published")return null;
  const hash=await legalDocumentHash(current.content,current.pdfData);
  let [snapshot]=await db.select().from(legalDocumentVersions).where(and(eq(legalDocumentVersions.documentKey,documentKey),eq(legalDocumentVersions.version,current.version))).limit(1);
  if(!snapshot){
   await db.insert(legalDocumentVersions).values({id:id("ldv"),documentKey,title:current.title,version:current.version,content:current.content,pdfData:current.pdfData,pdfFileName:current.pdfFileName,pdfHash:current.pdfHash||(current.pdfData?await pdfHash(current.pdfData):null),contentHash:hash,publishedAt:current.updatedAt,createdAt:current.updatedAt}).onConflictDoNothing();
   [snapshot]=await db.select().from(legalDocumentVersions).where(and(eq(legalDocumentVersions.documentKey,documentKey),eq(legalDocumentVersions.version,current.version))).limit(1);
  }
  if(!snapshot||snapshot.contentHash!==hash||snapshot.content!==current.content||snapshot.title!==current.title||snapshot.pdfHash!==(current.pdfHash||null)||snapshot.pdfFileName!==(current.pdfFileName||null)||snapshot.archivedAt)return null;
  result.push(snapshot);
 }
 return result;
}

export function evidenceFor(documents:NonNullable<Awaited<ReturnType<typeof currentRegistrationDocuments>>>):LegalEvidence[]{
 return documents.map(document=>({documentVersionId:document.id,documentKey:document.documentKey as RegistrationDocumentKey,documentVersion:document.version,documentHash:document.contentHash,acknowledgementType:document.documentKey==="datenschutz"?"read":"accepted"}));
}

export function matchesEvidence(expected:LegalEvidence[],submitted:unknown){
 if(!Array.isArray(submitted)||submitted.length!==expected.length)return false;
 const set=new Set(submitted);
 return set.size===expected.length&&expected.every(document=>set.has(document.documentVersionId));
}
