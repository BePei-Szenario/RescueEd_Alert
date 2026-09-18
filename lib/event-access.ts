import {and,eq,isNotNull} from "drizzle-orm";
import {getDb} from "@/db";
import {eventAdministrators,events} from "@/db/schema";
import {currentUser} from "@/lib/session";

export async function ownedEvent(eventId:string){
 const user=await currentUser();
 if(!user)return {user:null,event:null};
 const db=getDb(),[event]=await db.select().from(events).where(and(eq(events.id,eventId),eq(events.organizationId,user.organizationId))).limit(1);
 if(!event)return {user,event:null};
 if(user.accountType==="organization"&&(user.role==="customer"||user.role==="organization_member"))return {user,event};
 if(event.ownerUserId===user.id)return {user,event};
 const [membership]=await db.select({id:eventAdministrators.id}).from(eventAdministrators).where(and(eq(eventAdministrators.eventId,event.id),eq(eventAdministrators.userId,user.id),eq(eventAdministrators.role,"owner"),isNotNull(eventAdministrators.acceptedAt))).limit(1);
 return {user,event:membership?event:null};
}
