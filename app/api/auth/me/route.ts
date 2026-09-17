import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {organizations} from "@/db/schema";
import {currentUser} from "@/lib/session";

export async function GET(request:Request){
 const user=await currentUser();
 if(!user)return Response.json({authenticated:false},{status:401});
 if(user.accountType==="consumer"&&request.headers.get("x-rescueed-client")!=="mobile")return Response.json({authenticated:false},{status:403,headers:{"cache-control":"no-store"}});
 const [organization]=await getDb().select({name:organizations.name,billingEmail:organizations.billingEmail,billingStreet:organizations.billingStreet,billingHouseNumber:organizations.billingHouseNumber,billingPostalCode:organizations.billingPostalCode,billingCity:organizations.billingCity,complimentaryAccess:organizations.complimentaryAccess,unlimitedEventDuration:organizations.unlimitedEventDuration}).from(organizations).where(eq(organizations.id,user.organizationId)).limit(1);
 return Response.json({authenticated:true,id:user.id,role:user.role,accountType:user.accountType,email:user.email,fullName:user.fullName,organization:organization||null},{headers:{"cache-control":"no-store"}});
}
