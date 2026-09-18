import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {users} from "@/db/schema";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {consumeRateLimit,rateLimited} from "@/lib/rate-limit";
import {resendSetupInvitation} from "@/lib/setup-invitation";
import {requirePlatformOwnerApi} from "@/lib/session";

export async function POST(request:Request,{params}:{params:Promise<{userId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
 const {userId}=await params,db=getDb(),[member]=await db.select({email:users.email,status:users.status,emailVerifiedAt:users.emailVerifiedAt}).from(users).where(and(eq(users.id,userId),eq(users.role,"platform_staff"))).limit(1);
 if(!member||member.status!=="blocked"||member.emailVerifiedAt)return Response.json({error:"Für dieses Konto ist keine offene Einladung vorhanden."},{status:409});
 const limit=await consumeRateLimit({scope:"resend-platform-staff",subject:userId,limit:3,windowMs:60*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
 try{return await resendSetupInvitation(request,{actorId:auth.user!.id,targetId:userId,email:member.email,subject:"RescueEd Alert – Mitarbeiterzugang einrichten",message:"Sie wurden als Mitarbeiter der RescueEd Alert Unternehmerplattform eingeladen. Legen Sie über diesen einmaligen Link Ihr Passwort fest.",action:"platform_staff.invitation_resent"})}catch(error){console.error("staff_resend_failed",error);return Response.json({error:"Einladung konnte nicht erneut gesendet werden."},{status:500})}
}
