import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {events} from "@/db/schema";
import {currentUser} from "@/lib/session";

export async function ownedEvent(eventId:string){
 const user=await currentUser();
 if(!user)return {user:null,event:null};
 const [event]=await getDb().select().from(events).where(and(eq(events.id,eventId),eq(events.organizationId,user.organizationId))).limit(1);
 return {user,event:event||null};
}
