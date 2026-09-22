import {and,desc,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {appSubscriptions,appSubscriptionWithdrawals,auditLogs,emailOutbox} from "@/db/schema";
import {emailPayload} from "@/lib/email-signature";
import {senderFor} from "@/lib/email-settings";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {calendarYearRetentionEnd} from "@/lib/retention";
import {outboxPayloadExpiresAt,sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {id} from "@/lib/security";
import {currentUser} from "@/lib/session";

const noStore={"cache-control":"no-store"};
const withdrawalWindowMs=14*24*60*60_000;

async function currentSubscription(userId:string){
 return (await getDb().select().from(appSubscriptions).where(eq(appSubscriptions.userId,userId)).orderBy(desc(appSubscriptions.createdAt)).limit(1))[0]||null;
}

export async function GET(){
 const user=await currentUser();
 if(!user||user.accountType!=="consumer")return Response.json({error:"Nur für private App-Konten."},{status:403,headers:noStore});
 const subscription=await currentSubscription(user.id);
 if(!subscription)return Response.json({eligible:false,reason:"missing",request:null},{headers:noStore});
 const db=getDb(),[request]=await db.select().from(appSubscriptionWithdrawals).where(and(eq(appSubscriptionWithdrawals.userId,user.id),eq(appSubscriptionWithdrawals.subscriptionId,subscription.id))).limit(1);
 const purchasedAt=subscription.purchasedAt||subscription.createdAt,eligibleUntil=new Date(purchasedAt.getTime()+withdrawalWindowMs);
 return Response.json({eligible:!request&&Date.now()<=eligibleUntil.getTime(),eligibleUntil:eligibleUntil.toISOString(),purchasedAt:purchasedAt.toISOString(),store:subscription.store,productId:subscription.productId,request:request?{id:request.id,status:request.status,requestedAt:request.requestedAt.toISOString()}:null},{headers:noStore});
}

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const user=await currentUser();
  if(!user||user.accountType!=="consumer")return Response.json({error:"Nur für private App-Konten."},{status:403,headers:noStore});
  const body=await request.json() as {confirmed?:boolean};
  const contactEmail=user.email.trim().toLowerCase();
  if(body.confirmed!==true)return Response.json({error:"Bitte bestätigen Sie den Widerruf."},{status:400,headers:noStore});
  const limit=await consumeRateLimit({scope:"consumer-withdrawal",subject:JSON.stringify([user.id,requestNetwork(request)]),limit:5,windowMs:24*60*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const subscription=await currentSubscription(user.id);
  if(!subscription)return Response.json({error:"Es wurde kein App-Abo gefunden."},{status:404,headers:noStore});
  const purchasedAt=subscription.purchasedAt||subscription.createdAt,eligibleUntil=new Date(purchasedAt.getTime()+withdrawalWindowMs),now=new Date();
  if(now>eligibleUntil)return Response.json({error:"Die in der App ausgewiesene 14-tägige Widerrufsfrist ist abgelaufen. Gesetzliche Rechte und der Kundenservice bleiben unberührt."},{status:409,headers:noStore});
  const db=getDb(),[existing]=await db.select().from(appSubscriptionWithdrawals).where(eq(appSubscriptionWithdrawals.subscriptionId,subscription.id)).limit(1);
  if(existing)return Response.json({ok:true,id:existing.id,status:existing.status,requestedAt:existing.requestedAt.toISOString()},{headers:noStore});
  const withdrawalId=id("wdr"),mailId=id("mail"),senderEmail=await senderFor("customer_contact"),statement=`Hiermit widerrufe ich den Vertrag über das private RescueEd Alert Monatsabo (${subscription.productId}, ${subscription.store}).`,requestedAt=now;
  const payload=await sensitiveEmailPayload(request,mailId,"withdrawal_confirmation",emailPayload({template:"withdrawal_confirmation",message:"Wir bestätigen den Eingang Ihres Widerrufs.",withdrawalReference:withdrawalId,statement,requestedAt:requestedAt.toISOString(),store:subscription.store,productId:subscription.productId}));
  await db.batch([
   db.insert(appSubscriptionWithdrawals).values({id:withdrawalId,userId:user.id,subscriptionId:subscription.id,fullName:user.fullName,email:contactEmail,store:subscription.store,productId:subscription.productId,storeReferenceHash:subscription.storeReferenceHash,statement,status:"received",requestedAt,confirmationQueuedAt:now,retainUntil:calendarYearRetentionEnd(now,3),createdAt:now}),
   db.insert(emailOutbox).values({id:mailId,userId:user.id,type:"withdrawal_confirmation",senderEmail,recipientEmail:contactEmail,subject:"RescueEd Alert – Eingang Ihres Widerrufs",payloadJson:payload,sensitiveExpiresAt:outboxPayloadExpiresAt(now),createdAt:now}),
   db.insert(auditLogs).values({id:id("aud"),actorUserId:user.id,action:"consumer.withdrawal_received",entityType:"subscription_withdrawal",entityId:withdrawalId,metadataJson:JSON.stringify({subscriptionId:subscription.id,store:subscription.store,requestedAt:requestedAt.toISOString()}),createdAt:now})
  ]);
  return Response.json({ok:true,id:withdrawalId,status:"received",requestedAt:requestedAt.toISOString()},{status:201,headers:noStore});
 }catch(error){console.error("consumer_withdrawal_failed",error);return Response.json({error:"Der Widerruf konnte nicht entgegengenommen werden. Bitte nutzen Sie ersatzweise die in der Widerrufsbelehrung genannte E-Mail-Adresse."},{status:500,headers:noStore})}
}
