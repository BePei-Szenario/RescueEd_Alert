import {createHash} from "node:crypto";
import {sql} from "drizzle-orm";
import {getDb} from "@/db";
import {appCrashReports} from "@/db/schema";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";

function cleanStack(value:string){
 return value.split(/\r?\n/).filter(line=>/^#\d+\s/.test(line.trim())).slice(0,12).join("\n")
  .replace(/[^\S\n]+/g," ")
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,"[E-Mail]")
  .replace(/Bearer\s+\S+/gi,"Bearer [entfernt]")
  .replace(/(?:token|code|password|secret)=\S+/gi,"[Parameter entfernt]")
  .slice(0,3000);
}

export async function POST(request:Request){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  if(Number(request.headers.get("content-length")||0)>6000)return Response.json({error:"Bericht zu groß."},{status:413});
  const raw=await request.text();if(raw.length>6000)return Response.json({error:"Bericht zu groß."},{status:413});
  const body=JSON.parse(raw) as Record<string,unknown>;
  const platform=body.platform,source=body.source,appVersion=body.appVersion,errorKind=body.errorKind;
  if(!["android","ios"].includes(String(platform))||!["flutter","platform","zone"].includes(String(source))||typeof appVersion!=="string"||!/^[-\w.+() ]{1,40}$/.test(appVersion)||typeof errorKind!=="string"||!/^[-\w.<> ]{1,80}$/.test(errorKind)||typeof body.stack!=="string")return Response.json({error:"Ungültige Berichtsdaten."},{status:400});
  const stackExcerpt=cleanStack(body.stack);
  const network=await consumeRateLimit({scope:"app-crash-ip",subject:requestNetwork(request),limit:30,windowMs:86400000});if(!network.allowed)return rateLimited(network.retryAfterSeconds);
  const now=new Date(),reported=typeof body.occurredAt==="string"?new Date(body.occurredAt):now;
  const occurredAt=Number.isFinite(reported.getTime())&&Math.abs(now.getTime()-reported.getTime())<=7*86400000?reported:now;
  const fingerprint=createHash("sha256").update(`${platform}\n${appVersion}\n${source}\n${errorKind}\n${stackExcerpt.split("\n").slice(0,3).join("\n")}`).digest("hex");
  const db=getDb();await db.insert(appCrashReports).values({id:id("crash"),platform:platform as "android"|"ios",appVersion,source:source as string,errorKind,stackExcerpt,fingerprint,occurredAt,createdAt:now});
  // Reports contain no account identifier and are automatically removed after 30 days.
  await db.run(sql`DELETE FROM app_crash_reports WHERE id IN (SELECT id FROM app_crash_reports WHERE created_at < ${now.getTime()-30*86400000} LIMIT 100)`);
  return Response.json({ok:true},{status:202,headers:{"cache-control":"no-store"}});
 }catch(error){if(error instanceof SyntaxError)return Response.json({error:"Ungültiges JSON."},{status:400});console.error("app_crash_ingest_failed",error);return Response.json({error:"Bericht konnte nicht gespeichert werden."},{status:500})}
}
