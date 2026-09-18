import {and,eq,ne} from "drizzle-orm";
import {getDb} from "@/db";
import {legalAcknowledgements,legalDocumentVersions,organizations,users} from "@/db/schema";
import {currentUser} from "@/lib/session";

export async function GET(){
 const account=await currentUser();
 if(!account)return Response.json({error:"Bitte zuerst anmelden."},{status:401});
 try{
  const db=getDb(),[organizationRows,acknowledgements,members,accountRows]=await Promise.all([
   db.select({name:organizations.name,organizationType:organizations.organizationType}).from(organizations).where(eq(organizations.id,account.organizationId)).limit(1),
   db.select({documentKey:legalAcknowledgements.documentKey,version:legalAcknowledgements.documentVersion,acknowledgementType:legalAcknowledgements.acknowledgementType,acceptedAt:legalAcknowledgements.acceptedAt,title:legalDocumentVersions.title,signerId:users.id,signerName:users.fullName}).from(legalAcknowledgements).innerJoin(legalDocumentVersions,eq(legalAcknowledgements.documentVersionId,legalDocumentVersions.id)).innerJoin(users,eq(legalAcknowledgements.userId,users.id)).where(eq(legalAcknowledgements.organizationId,account.organizationId)),
   account.role==="customer"&&account.accountType==="organization"?db.select({id:users.id,name:users.fullName,email:users.email,status:users.status,emailVerifiedAt:users.emailVerifiedAt}).from(users).where(and(eq(users.organizationId,account.organizationId),eq(users.role,"organization_member"),ne(users.status,"deleted"))):Promise.resolve([]),
   db.select({protectedAccount:users.protectedAccount}).from(users).where(eq(users.id,account.id)).limit(1)
  ]);
  const organization=organizationRows[0];
  return Response.json({profile:{id:account.id,name:account.fullName,email:account.email,role:account.role,organization:organization?.name??null,organizationType:organization?.organizationType??null,canDeleteAccount:account.role==="customer"&&account.accountType==="organization"&&!accountRows[0]?.protectedAccount},acknowledgements:acknowledgements.map(row=>({...row,acceptedAt:row.acceptedAt.toISOString(),own:row.signerId===account.id})),members:members.map(member=>({...member,emailVerifiedAt:member.emailVerifiedAt?.toISOString()??null}))},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("profile_read_failed",error);return Response.json({error:"Profil konnte nicht geladen werden."},{status:500})}
}
