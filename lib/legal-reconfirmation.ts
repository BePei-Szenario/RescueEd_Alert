import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {legalAcknowledgements,legalDocuments,users} from "@/db/schema";
import {currentConsumerDocuments,consumerEvidence} from "@/lib/consumer-legal";
import {currentRegistrationDocuments,evidenceFor} from "@/lib/legal-registration";

export type LegalAccount={id:string;organizationId:string;role:string;accountType:string};

export async function legalReconfirmation(account:LegalAccount){
 if(account.role==="platform_owner"||account.role==="platform_staff")return {required:false,available:true,canConfirm:false,documents:[]};
 const consumer=account.accountType==="consumer";
 const keys=consumer?["agb_b2c","datenschutz","widerruf"]:["agb","datenschutz","avv","sla"];
 const db=getDb(),published=await db.select({documentKey:legalDocuments.documentKey,status:legalDocuments.status}).from(legalDocuments);
 // Unpublished documents cannot be accepted. Existing events continue, but
 // new bookings remain blocked until every required document is available.
 if(!keys.every(key=>published.some(row=>row.documentKey===key&&row.status==="published")))return {required:true,available:false,canConfirm:false,documents:[]};
 const snapshots=consumer?await currentConsumerDocuments():await currentRegistrationDocuments();
 if(!snapshots)return {required:true,available:false,canConfirm:false,documents:[]};
 const expected=consumer?consumerEvidence(snapshots as NonNullable<Awaited<ReturnType<typeof currentConsumerDocuments>>>):evidenceFor(snapshots as NonNullable<Awaited<ReturnType<typeof currentRegistrationDocuments>>>);
 let signerId=account.id;
 if(!consumer){
  const [owner]=await db.select({id:users.id}).from(users).where(and(eq(users.organizationId,account.organizationId),eq(users.role,"customer"))).limit(1);
  signerId=owner?.id||"";
 }
 const accepted=signerId?await db.select({documentVersionId:legalAcknowledgements.documentVersionId,documentHash:legalAcknowledgements.documentHash,acknowledgementType:legalAcknowledgements.acknowledgementType}).from(legalAcknowledgements).where(eq(legalAcknowledgements.userId,signerId)):[];
 const missing=expected.filter(document=>!accepted.some(row=>row.documentVersionId===document.documentVersionId&&row.documentHash===document.documentHash&&row.acknowledgementType===document.acknowledgementType));
 return {required:missing.length>0,available:true,canConfirm:consumer||account.role==="customer",documents:missing.map(document=>{
  const snapshot=snapshots.find(row=>row.id===document.documentVersionId)!;
  return {id:snapshot.id,documentKey:snapshot.documentKey,title:snapshot.title,version:snapshot.version,content:snapshot.content,contentHash:snapshot.contentHash,acknowledgementType:document.acknowledgementType};
 })};
}
