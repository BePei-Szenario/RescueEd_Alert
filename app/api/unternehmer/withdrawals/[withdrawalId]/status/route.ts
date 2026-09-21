import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {appSubscriptionWithdrawals,auditLogs} from "@/db/schema";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";
import {requirePlatformOwnerApi} from "@/lib/session";

const allowed=["received","processing","refunded","rejected"] as const;
type WithdrawalStatus=typeof allowed[number];

export async function POST(request:Request,{params}:{params:Promise<{withdrawalId:string}>}){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const auth=await requirePlatformOwnerApi();if(auth.response)return auth.response;
  const {withdrawalId}=await params,body=await request.json() as {status?:string};
  if(!allowed.includes(body.status as WithdrawalStatus))return Response.json({error:"Ungültiger Widerrufsstatus."},{status:400});
  const db=getDb(),[existing]=await db.select({id:appSubscriptionWithdrawals.id}).from(appSubscriptionWithdrawals).where(eq(appSubscriptionWithdrawals.id,withdrawalId)).limit(1);
  if(!existing)return Response.json({error:"Widerruf nicht gefunden."},{status:404});
  const now=new Date(),status=body.status as WithdrawalStatus;
  await db.batch([
   db.update(appSubscriptionWithdrawals).set({status,resolvedAt:status==="refunded"||status==="rejected"?now:null}).where(eq(appSubscriptionWithdrawals.id,withdrawalId)),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:auth.user!.id,action:`consumer.withdrawal_${status}`,entityType:"subscription_withdrawal",entityId:withdrawalId,createdAt:now})
  ]);
  return Response.json({ok:true,status});
 }catch(error){console.error("withdrawal_status_failed",error);return Response.json({error:"Widerrufsstatus konnte nicht gespeichert werden."},{status:500})}
}
