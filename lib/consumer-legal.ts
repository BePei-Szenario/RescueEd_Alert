import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {legalDocuments,legalDocumentVersions} from "@/db/schema";
import {legalDocumentHash,pdfHash} from "@/lib/legal-document-file";
import {id} from "@/lib/security";

export const CONSUMER_DOCUMENT_KEYS=["agb_b2c","datenschutz","widerruf"] as const;
export type ConsumerDocumentKey=typeof CONSUMER_DOCUMENT_KEYS[number];
export type ConsumerLegalEvidence={documentVersionId:string;documentKey:ConsumerDocumentKey;documentVersion:string;documentHash:string;acknowledgementType:"accepted"|"read"};

export async function currentConsumerDocuments(){
 const db=getDb(),rows=[];
 for(const key of CONSUMER_DOCUMENT_KEYS){
  const [current]=await db.select().from(legalDocuments).where(eq(legalDocuments.documentKey,key)).limit(1);
  if(!current||current.status!=="published")return null;
  const hash=await legalDocumentHash(current.content,current.pdfData);
  let [snapshot]=await db.select().from(legalDocumentVersions).where(and(eq(legalDocumentVersions.documentKey,key),eq(legalDocumentVersions.version,current.version))).limit(1);
  if(!snapshot){
   await db.insert(legalDocumentVersions).values({id:id("ldv"),documentKey:key,title:current.title,version:current.version,content:current.content,pdfData:current.pdfData,pdfFileName:current.pdfFileName,pdfHash:current.pdfHash||(current.pdfData?await pdfHash(current.pdfData):null),contentHash:hash,publishedAt:current.updatedAt,createdAt:current.updatedAt}).onConflictDoNothing();
   [snapshot]=await db.select().from(legalDocumentVersions).where(and(eq(legalDocumentVersions.documentKey,key),eq(legalDocumentVersions.version,current.version))).limit(1);
  }
  if(!snapshot||snapshot.archivedAt||snapshot.contentHash!==hash||snapshot.content!==current.content||snapshot.pdfHash!==(current.pdfHash||null)||snapshot.pdfFileName!==(current.pdfFileName||null))return null;
  rows.push(snapshot);
 }
 return rows;
}

export function consumerEvidence(documents:NonNullable<Awaited<ReturnType<typeof currentConsumerDocuments>>>):ConsumerLegalEvidence[]{
 return documents.map(row=>({documentVersionId:row.id,documentKey:row.documentKey as ConsumerDocumentKey,documentVersion:row.version,documentHash:row.contentHash,acknowledgementType:row.documentKey==="agb_b2c"?"accepted":"read"}));
}

export function matchesConsumerEvidence(expected:ConsumerLegalEvidence[],submitted:unknown){
 if(!Array.isArray(submitted)||submitted.length!==expected.length)return false;
 const given=new Set(submitted);
 return given.size===expected.length&&expected.every(row=>given.has(row.documentVersionId));
}
