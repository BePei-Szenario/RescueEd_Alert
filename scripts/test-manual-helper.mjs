import assert from "node:assert/strict";
import {createHash, randomUUID} from "node:crypto";
import {spawn, spawnSync} from "node:child_process";
import {mkdtemp, rm} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";

const root=path.resolve(import.meta.dirname,"..");
const temporary=await mkdtemp(path.join(os.tmpdir(),"rescueed-manual-helper-test-"));
const database=path.join(temporary,"test.sqlite");
const hash=value=>createHash("sha256").update(value).digest("hex");
const now=Date.now();
const organizationId=`org-${randomUUID()}`;
const userId=`usr-${randomUUID()}`;
const eventId=`evt-${randomUUID()}`;
const unitId=`asn-${randomUUID()}`;
const emptyUnitId=`asn-${randomUUID()}`;
let server;

function availablePort(){return new Promise((resolve,reject)=>{const listener=net.createServer();listener.once("error",reject);listener.listen(0,"127.0.0.1",()=>{const address=listener.address();listener.close(()=>resolve(address.port))})})}
async function ready(base,child){for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw new Error(`Testserver endete mit ${child.exitCode}`);try{if((await fetch(base+"/api/health")).ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,150))}throw new Error("Testserver nicht erreichbar.")}
async function request(base,route,cookie,method="GET",body){const response=await fetch(base+route,{method,headers:{cookie,origin:base,"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()}}

try{
 const migrated=spawnSync(process.execPath,[path.join(root,"scripts/migrate-sqlite.mjs")],{cwd:root,env:{...process.env,DATABASE_PATH:database},encoding:"utf8",timeout:30000});
 assert.equal(migrated.status,0,migrated.stderr||migrated.error?.message);
 const db=new DatabaseSync(database);
 db.exec("PRAGMA foreign_keys=ON");
 db.prepare("INSERT INTO organizations (id,name,billing_email,created_at) VALUES (?,?,?,?)").run(organizationId,"Helfer-Testorganisation","billing@example.invalid",now);
 db.prepare("INSERT INTO users (id,organization_id,full_name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)").run(userId,organizationId,"Helfer Test","owner@example.invalid","unused","customer",now);
 const rawSession=randomUUID()+randomUUID();
 db.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),userId,hash(rawSession),now+3600000,now);
 db.prepare("INSERT INTO events (id,organization_id,owner_user_id,name,event_date,helper_limit,price_cents,public_join_token_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(eventId,organizationId,userId,"Helfertest",new Date().toISOString().slice(0,10),20,599,hash(randomUUID()),now);
 db.prepare("INSERT INTO assignments (id,event_id,name,created_at) VALUES (?,?,?,?)").run(unitId,eventId,"RTW Test",now);
 db.prepare("INSERT INTO assignments (id,event_id,name,created_at) VALUES (?,?,?,?)").run(emptyUnitId,eventId,"Nur manuell",now);
 const port=await availablePort(),base=`http://127.0.0.1:${port}`,cookie=`rescueed_session=${rawSession}`;
 server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,env:{...process.env,DATABASE_PATH:database,NODE_ENV:"production",PUBLIC_BASE_URL:base},stdio:"ignore"});
 await ready(base,server);
 const manual=await request(base,`/api/events/${eventId}/helpers`,cookie,"POST",{firstName:"Mara",lastName:"Muster",qualification:"SanHelfer"});
 assert.equal(manual.status,201,JSON.stringify(manual.data));
 const detail=await request(base,`/api/events/${eventId}`,cookie);
 assert.equal(detail.status,200,JSON.stringify(detail.data));
 assert.equal(detail.data.helpers.find(person=>person.id===manual.data.helperId)?.registrationSource,"manual");
 const assignManual=await request(base,`/api/events/${eventId}/helpers/${manual.data.helperId}`,cookie,"PATCH",{assignmentId:unitId});
 assert.equal(assignManual.status,409,JSON.stringify(assignManual.data));
 assert.equal((await request(base,`/api/events/${eventId}/alerts`,cookie,"POST",{assignmentIds:[unitId]})).status,400);
 const qrHelperId=`hlp-${randomUUID()}`;
 db.prepare("INSERT INTO helpers (id,event_id,assignment_id,name,first_name,last_name,qualification,session_token_hash,registration_source,registered_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(qrHelperId,eventId,unitId,"Quirin QR","Quirin","QR","SanHelfer",hash(randomUUID()),"qr",now);
 const alarm=await request(base,`/api/events/${eventId}/alerts`,cookie,"POST",{assignmentIds:[unitId]});
 assert.equal(alarm.status,201,JSON.stringify(alarm.data));
 assert.equal(alarm.data.alert.recipientCount,1);
 // Even inconsistent legacy data must never turn a manual helper into an alarm recipient.
 db.prepare("UPDATE helpers SET assignment_id=? WHERE id=?").run(emptyUnitId,manual.data.helperId);
 assert.equal((await request(base,`/api/events/${eventId}/alerts`,cookie,"POST",{assignmentIds:[emptyUnitId]})).status,400);
 assert.equal(db.prepare("SELECT count(*) AS n FROM alert_recipients WHERE helper_id=?").get(manual.data.helperId).n,0);
 db.close();
 process.stdout.write("Helfer-Test bestanden: manuelle Anlage, keine Einteilung/Alarmierung, QR-Helfer weiterhin alarmierbar.\n");
}finally{
 if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>{server.once("exit",resolve);setTimeout(resolve,3000)})}
 const resolved=path.resolve(temporary);
 if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith("rescueed-manual-helper-test-"))await rm(resolved,{recursive:true,force:true});
}
