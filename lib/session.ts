import {cookies} from "next/headers";
import {and,eq,gt} from "drizzle-orm";
import {getDb} from "@/db";
import {sessions,users} from "@/db/schema";
import {tokenHash} from "@/lib/security";

export async function currentUser(){
 const raw=(await cookies()).get("rescueed_session")?.value;
 if(!raw)return null;
 const db=getDb(),now=new Date();
 const [row]=await db.select({sessionId:sessions.id,id:users.id,organizationId:users.organizationId,fullName:users.fullName,email:users.email,role:users.role,accountType:users.accountType,status:users.status}).from(sessions).innerJoin(users,eq(sessions.userId,users.id)).where(and(eq(sessions.tokenHash,await tokenHash(raw)),gt(sessions.expiresAt,now))).limit(1);
 return row?.status==="active"?row:null;
}

export async function platformOwner(){
 const user=await currentUser();
 return user?.role==="platform_owner"?user:null;
}

export async function platformStaff(){
 const user=await currentUser();
 return user?.role==="platform_owner"||user?.role==="platform_staff"?user:null;
}

export async function requirePlatformOwnerApi(){
 const user=await platformOwner();
 return user?{user,response:null}:{user:null,response:Response.json({error:"Nicht autorisiert."},{status:401})};
}

export async function requirePlatformStaffApi(){
 const user=await platformStaff();
 return user?{user,response:null}:{user:null,response:Response.json({error:"Nicht autorisiert."},{status:401})};
}
