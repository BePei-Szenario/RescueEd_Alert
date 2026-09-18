import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {users} from "@/db/schema";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {consumeRateLimit,rateLimited} from "@/lib/rate-limit";
import {resendSetupInvitation} from "@/lib/setup-invitation";
import {currentUser} from "@/lib/session";

export async function POST(request:Request,{params}:{params:Promise<{userId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 const owner=await currentUser();if(!owner||owner.role!=="customer"||owner.accountType!=="organization")return Response.json({error:"Nicht autorisiert."},{status:403});
 const {userId}=await params,db=getDb(),[member]=await db.select({email:users.email,status:users.status,emailVerifiedAt:users.emailVerifiedAt}).from(users).where(and(eq(users.id,userId),eq(users.organizationId,owner.organizationId),eq(users.role,"organization_member"))).limit(1);
 if(!member||member.status!=="blocked"||member.emailVerifiedAt)return Response.json({error:"Für dieses Konto ist keine offene Einladung vorhanden."},{status:409});
 const limit=await consumeRateLimit({scope:"resend-organization-member",subject:userId,limit:3,windowMs:60*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
 try{return await resendSetupInvitation(request,{actorId:owner.id,targetId:userId,email:member.email,subject:"RescueEd Alert – Event-Benutzer einrichten",message:"Ihre Organisation hat Sie als Event-Benutzer eingeladen. Legen Sie über diesen einmaligen Link Ihr Passwort fest.",action:"organization_member.invitation_resent"})}catch(error){console.error("member_resend_failed",error);return Response.json({error:"Einladung konnte nicht erneut gesendet werden."},{status:500})}
}
