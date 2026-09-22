import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {spawn,spawnSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";

const root=path.resolve(import.meta.dirname,"..");
const temporary=await mkdtemp(path.join(os.tmpdir(),"rescueed-event-access-test-"));
const database=path.join(temporary,"test.sqlite"),key=randomBytes(32).toString("base64"),now=Date.now();
let server;

function availablePort(){return new Promise((resolve,reject)=>{const listener=net.createServer();listener.once("error",reject);listener.listen(0,"127.0.0.1",()=>{const address=listener.address();listener.close(()=>resolve(address.port))})})}
async function ready(base,child){for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw new Error(`Testserver endete mit ${child.exitCode}`);try{if((await fetch(base+"/api/health")).ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,150))}throw new Error("Testserver nicht erreichbar.")}

try{
 const migrated=spawnSync(process.execPath,[path.join(root,"scripts/migrate-sqlite.mjs")],{cwd:root,env:{...process.env,DATABASE_PATH:database},encoding:"utf8",timeout:30000});
 assert.equal(migrated.status,0,migrated.stderr||migrated.error?.message);
 const db=new DatabaseSync(database),organizationId=`org-${randomUUID()}`,userId=`usr-${randomUUID()}`;
 db.exec("PRAGMA foreign_keys=ON");
 db.prepare("INSERT INTO organizations (id,name,billing_email,created_at) VALUES (?,?,?,?)").run(organizationId,"Zugriffstest","billing@example.invalid",now);
 db.prepare("INSERT INTO users (id,organization_id,full_name,email,password_hash,account_type,role,status,mfa_enabled,protected_account,created_at) VALUES (?,?,?,?,?,'organization','customer','active',1,0,?)").run(userId,organizationId,"Zugriffstest","owner@example.invalid","unused",now);
 db.close();
 const port=await availablePort(),base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,env:{...process.env,DATABASE_PATH:database,EVENT_ACCESS_CODE_KEY:key,NODE_ENV:"production",PUBLIC_BASE_URL:base},stdio:"ignore"});
 await ready(base,server);
 const runtime=spawnSync(process.execPath,[path.join(root,"scripts/test-event-access-runtime.mjs")],{cwd:root,env:{...process.env,DATABASE_PATH:database,EVENT_ACCESS_CODE_KEY:key,BASE_URL:base},encoding:"utf8",timeout:30000});
 assert.equal(runtime.status,0,runtime.stderr||runtime.error?.message||runtime.stdout);
 process.stdout.write(runtime.stdout);
}finally{
 if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>{server.once("exit",resolve);setTimeout(resolve,3000)})}
 const resolved=path.resolve(temporary);
 if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith("rescueed-event-access-test-")){
  try{await rm(resolved,{recursive:true,force:true,maxRetries:2,retryDelay:100})}catch(error){if(process.platform!=="win32"||error?.code!=="EBUSY")throw error}
 }
}
