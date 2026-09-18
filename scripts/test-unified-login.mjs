import assert from "node:assert/strict";
import {pbkdf2Sync,randomUUID} from "node:crypto";
import {spawn,spawnSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";

const root=path.resolve(import.meta.dirname,"..");
const temporary=await mkdtemp(path.join(os.tmpdir(),"rescueed-unified-login-test-"));
const database=path.join(temporary,"test.sqlite");
const now=Date.now(),password=`Test-${randomUUID()}`;
const users=[
 {id:`usr-${randomUUID()}`,email:"operator@example.invalid",role:"platform_owner",accountType:"organization",redirectTo:"/unternehmer"},
 {id:`usr-${randomUUID()}`,email:"staff@example.invalid",role:"platform_staff",accountType:"organization",redirectTo:"/unternehmer"},
 {id:`usr-${randomUUID()}`,email:"organization@example.invalid",role:"customer",accountType:"organization",redirectTo:"/"},
 {id:`usr-${randomUUID()}`,email:"member@example.invalid",role:"organization_member",accountType:"organization",redirectTo:"/"},
 {id:`usr-${randomUUID()}`,email:"consumer@example.invalid",role:"customer",accountType:"consumer",redirectTo:null},
];
let server;
function secret(value){const salt=randomUUID(),digest=pbkdf2Sync(value,salt,210000,32,"sha256").toString("hex");return `pbkdf2-sha256$210000$${salt}$${digest}`}
function availablePort(){return new Promise((resolve,reject)=>{const listener=net.createServer();listener.once("error",reject);listener.listen(0,"127.0.0.1",()=>{const address=listener.address();listener.close(()=>resolve(address.port))})})}
async function ready(base,child){for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw new Error(`Testserver endete mit ${child.exitCode}`);try{if((await fetch(base+"/api/health")).ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,150))}throw new Error("Testserver nicht erreichbar.")}
async function request(base,route,body,cookie){const response=await fetch(base+route,{method:body===undefined?"GET":"POST",headers:{origin:base,"content-type":"application/json",...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:"manual"});return {response,data:await response.json()}}

try{
 const migrated=spawnSync(process.execPath,[path.join(root,"scripts/migrate-sqlite.mjs")],{cwd:root,env:{...process.env,DATABASE_PATH:database},encoding:"utf8",timeout:30000});
 assert.equal(migrated.status,0,migrated.stderr||migrated.error?.message);
 const db=new DatabaseSync(database);
 db.exec("PRAGMA foreign_keys=ON");
 const hash=secret(password);
 for(const user of users){const organizationId=`org-${randomUUID()}`;db.prepare("INSERT INTO organizations (id,name,billing_email,created_at) VALUES (?,?,?,?)").run(organizationId,"Login-Test",user.email,now);db.prepare("INSERT INTO users (id,organization_id,full_name,email,password_hash,account_type,role,created_at) VALUES (?,?,?,?,?,?,?,?)").run(user.id,organizationId,"Login Test",user.email,hash,user.accountType,user.role,now)}
 const port=await availablePort(),base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,env:{...process.env,DATABASE_PATH:database,NODE_ENV:"production",PUBLIC_BASE_URL:base,EMAIL_PAYLOAD_KEY:""},stdio:"ignore"});
 await ready(base,server);
 const legacy=await fetch(base+"/unternehmer/login",{redirect:"manual"});
 assert.equal(legacy.status,307);
 assert.equal(legacy.headers.get("location"),"/?login=1");
 for(const user of users){
  const login=await request(base,"/api/auth/login",{email:user.email,password,area:"web"});
  if(user.accountType==="consumer"){assert.equal(login.response.status,403);continue}
  assert.equal(login.response.status,200,JSON.stringify(login.data));
  assert.equal(login.data.mfaRequired,true);
  const message=db.prepare("SELECT payload_json FROM email_outbox WHERE user_id=? AND type='mfa' ORDER BY created_at DESC LIMIT 1").get(user.id);
  const code=JSON.parse(message.payload_json).securityCode;
  const verified=await request(base,"/api/auth/mfa/verify",{challenge:login.data.challenge,code});
  assert.equal(verified.response.status,200,JSON.stringify(verified.data));
  assert.equal(verified.data.redirectTo,user.redirectTo);
  const cookie=verified.response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const profile=await request(base,"/api/auth/me",undefined,cookie);
  assert.equal(profile.data.role,user.role);
  const ownerPage=await fetch(base+"/unternehmer",{headers:{cookie},redirect:"manual"});
  assert.equal(ownerPage.status,user.redirectTo==="/unternehmer"?200:307);
 }
 const legacyOrganization=await request(base,"/api/auth/login",{email:"organization@example.invalid",password,area:"customer"});
 assert.equal(legacyOrganization.response.status,200,"Der bestehende Organisationslogin der App muss weiter funktionieren.");
 const appConsumer=await request(base,"/api/auth/login",{email:"consumer@example.invalid",password,area:"mobile_consumer"});
 assert.equal(appConsumer.response.status,200,"Der private App-Login muss weiter funktionieren.");
 db.close();
 process.stdout.write("Gemeinsamer Login-Test bestanden: Unternehmer, Organisation, MFA-Weiterleitung und App-only-Sperre.\n");
}finally{
 if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>{server.once("exit",resolve);setTimeout(resolve,3000)})}
 const resolved=path.resolve(temporary);
 if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith("rescueed-unified-login-test-"))await rm(resolved,{recursive:true,force:true});
}
