import {currentUser} from "@/lib/session";
import {claimSubscription,consumerEntitlement,type StoreName} from "@/lib/app-subscriptions";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";

export async function GET(){
 const user=await currentUser();if(!user||user.accountType!=="consumer")return Response.json({error:"Nur für B2C-App-Konten."},{status:403});
 const entitlement=await consumerEntitlement(user.id);
 return Response.json(entitlement,{headers:{"cache-control":"no-store"}});
}

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const user=await currentUser();if(!user||user.accountType!=="consumer")return Response.json({error:"Nur für B2C-App-Konten."},{status:403});
  const limit=await consumeRateLimit({scope:"consumer-subscription-claim",subject:JSON.stringify([user.id,requestNetwork(request)]),limit:10,windowMs:60*60_000});if(!limit.allowed)return rateLimited(limit.retryAfterSeconds);
  const body=await request.json() as {store?:string;reference?:string};
  if((body.store!=="google"&&body.store!=="apple")||typeof body.reference!=="string"||body.reference.length<5||body.reference.length>4096)return Response.json({error:"Ungültige Kaufdaten."},{status:400});
  const result=await claimSubscription(user.id,body.store as StoreName,body.reference);
  return Response.json(result,{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("consumer_subscription_claim_failed",error);return Response.json({error:"Der Kauf konnte nicht beim Store bestätigt werden. Es wurde kein Zugang freigeschaltet."},{status:503,headers:{"cache-control":"no-store"}})}
}
