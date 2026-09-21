import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {organizations} from "@/db/schema";
import {currentUser} from "@/lib/session";
import {legalReconfirmation} from "@/lib/legal-reconfirmation";
import {currentEventAccess,permissionsForRole} from "@/lib/event-access";

export async function GET(request:Request){
 const user=await currentUser();
 if(!user){const access=await currentEventAccess();return access?Response.json({authenticated:true,eventAccess:{eventId:access.eventId,role:access.role,permissions:permissionsForRole(access.role)}},{headers:{"cache-control":"no-store"}}):Response.json({authenticated:false},{status:401})}
 if(user.accountType==="consumer"&&request.headers.get("x-rescueed-client")!=="mobile")return Response.json({authenticated:false},{status:403,headers:{"cache-control":"no-store"}});
 const [organization]=await getDb().select({name:organizations.name,organizationType:organizations.organizationType,billingEmail:organizations.billingEmail,billingStreet:organizations.billingStreet,billingHouseNumber:organizations.billingHouseNumber,billingPostalCode:organizations.billingPostalCode,billingCity:organizations.billingCity,complimentaryAccess:organizations.complimentaryAccess,unlimitedEventDuration:organizations.unlimitedEventDuration}).from(organizations).where(eq(organizations.id,user.organizationId)).limit(1);
 const review=await legalReconfirmation(user);
 return Response.json({authenticated:true,id:user.id,role:user.role,accountType:user.accountType,email:user.email,fullName:user.fullName,organization:organization||null,legalUpdateRequired:review.required,legalUpdateAvailable:review.available,legalCanConfirm:review.canConfirm},{headers:{"cache-control":"no-store"}});
}
