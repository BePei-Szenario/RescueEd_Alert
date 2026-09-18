import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {spawn,spawnSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";

const root=path.resolve(import.meta.dirname,".."),temporary=await mkdtemp(path.join(os.tmpdir(),"rescueed-legal-test-"));
const database=path.join(temporary,"test.sqlite"),hash=value=>createHash("sha256").update(value).digest("hex");
const now=Date.now(),organizationId=`org-${randomUUID()}`,ownerId=`usr-${randomUUID()}`,memberId=`usr-${randomUUID()}`,consumerOrganizationId=`org-${randomUUID()}`,consumerId=`usr-${randomUUID()}`;
let server;
function availablePort(){return new Promise((resolve,reject)=>{const listener=net.createServer();listener.once("error",reject);listener.listen(0,"127.0.0.1",()=>{const address=listener.address();listener.close(()=>resolve(address.port))})})}
function session(db,userId){const raw=randomUUID()+randomUUID();db.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),userId,hash(raw),now+3600000,now);return `rescueed_session=${raw}`}
async function request(base,route,cookie,method="GET",body,mobile=false){const response=await fetch(base+route,{method,headers:{cookie,origin:base,"content-type":"application/json",...(mobile?{"x-rescueed-client":"mobile"}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()}}
async function ready(base,child){for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw new Error(`Testserver endete mit ${child.exitCode}`);try{const response=await fetch(base+"/api/health");if(response.ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,150))}throw new Error("Testserver nicht erreichbar.")}

try{
 const migrated=spawnSync(process.execPath,[path.join(root,"scripts/migrate-sqlite.mjs")],{cwd:root,env:{...process.env,DATABASE_PATH:database},encoding:"utf8",timeout:30000});
 assert.equal(migrated.status,0,migrated.stderr||migrated.error?.message);
 const db=new DatabaseSync(database);
 db.exec("PRAGMA foreign_keys=ON");
 db.prepare("INSERT INTO organizations (id,name,billing_email,created_at) VALUES (?,?,?,?)").run(organizationId,"Rechtstest Organisation","rechnung@example.invalid",now);
 db.prepare("INSERT INTO users (id,organization_id,full_name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)").run(ownerId,organizationId,"Test Hauptkonto","legal-owner@example.invalid","unused","customer",now);
 db.prepare("INSERT INTO users (id,organization_id,full_name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)").run(memberId,organizationId,"Test Mitarbeiter","legal-member@example.invalid","unused","organization_member",now);
 db.prepare("INSERT INTO organizations (id,name,billing_email,created_at) VALUES (?,?,?,?)").run(consumerOrganizationId,"Rechtstest Privatkonto","consumer@example.invalid",now);
 db.prepare("INSERT INTO users (id,organization_id,full_name,email,password_hash,account_type,role,created_at) VALUES (?,?,?,?,?,?,?,?)").run(consumerId,consumerOrganizationId,"Test Privatkonto","consumer@example.invalid","unused","consumer","customer",now);
 const ownerCookie=session(db,ownerId),memberCookie=session(db,memberId),consumerCookie=session(db,consumerId);
 for(const key of ["agb","agb_b2c","datenschutz","avv","sla","widerruf"]){const content=`Testfassung ${key} 1`,versionId=`ldv-${randomUUID()}`;
  db.prepare("INSERT INTO legal_documents (document_key,title,version,content,status,updated_at) VALUES (?,?,?,?,?,?)").run(key,key.toUpperCase(),"1",content,"published",now);
  db.prepare("INSERT INTO legal_document_versions (id,document_key,title,version,content,content_hash,published_at,created_at) VALUES (?,?,?,?,?,?,?,?)").run(versionId,key,key.toUpperCase(),"1",content,hash(content),now,now);
 }
 db.close();
 const port=await availablePort(),base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,env:{...process.env,DATABASE_PATH:database,NODE_ENV:"production",PUBLIC_BASE_URL:base},stdio:"ignore"});
 await ready(base,server);
 const ownerBefore=await request(base,"/api/auth/me",ownerCookie);
 assert.equal(ownerBefore.status,200);assert.equal(ownerBefore.data.legalUpdateRequired,true);
 const memberBefore=await request(base,"/api/auth/me",memberCookie);
 assert.equal(memberBefore.data.legalUpdateRequired,true);assert.equal(memberBefore.data.legalCanConfirm,false);
 assert.equal((await request(base,"/api/events",ownerCookie)).status,200,"Laufende Events müssen abrufbar bleiben.");
 assert.equal((await request(base,"/api/events",ownerCookie,"POST",{})).status,428,"Neues Event ohne Bestätigung muss gesperrt sein.");
 assert.equal((await request(base,"/api/legal/reconfirmation",memberCookie,"POST",{acceptedDocumentVersionIds:[]})).status,403);
 const review=await request(base,"/api/legal/reconfirmation",ownerCookie);
 assert.equal(review.status,200);assert.equal(review.data.documents.length,4);
 assert.equal((await request(base,"/api/legal/reconfirmation",ownerCookie,"POST",{acceptedDocumentVersionIds:review.data.documents.slice(0,3).map(row=>row.id)})).status,400);
 assert.equal((await request(base,"/api/legal/reconfirmation",ownerCookie,"POST",{acceptedDocumentVersionIds:review.data.documents.map(row=>row.id)})).status,200);
 assert.equal((await request(base,"/api/auth/me",ownerCookie)).data.legalUpdateRequired,false);
 assert.equal((await request(base,"/api/auth/me",memberCookie)).data.legalUpdateRequired,false);
 const data=new DatabaseSync(database);data.exec("PRAGMA foreign_keys=ON");
 assert.equal(data.prepare("SELECT count(*) AS n FROM legal_acknowledgements WHERE user_id=?").get(ownerId).n,4);
 const prior=data.prepare("SELECT id FROM legal_document_versions WHERE document_key='agb' AND version='1'").get();
 const changedAt=Date.now(),newContent="Testfassung agb 2";
 data.prepare("UPDATE legal_document_versions SET archived_at=? WHERE id=?").run(changedAt,prior.id);
 data.prepare("INSERT INTO legal_document_versions (id,document_key,title,version,content,content_hash,published_at,created_at) VALUES (?,?,?,?,?,?,?,?)").run(`ldv-${randomUUID()}`,"agb","AGB","2",newContent,hash(newContent),changedAt,changedAt);
 data.prepare("UPDATE legal_documents SET version='2',content=?,updated_at=? WHERE document_key='agb'").run(newContent,changedAt);
 const changed=await request(base,"/api/legal/reconfirmation",ownerCookie);
 assert.equal(changed.data.documents.length,1);assert.equal(changed.data.documents[0].version,"2");
 assert.equal((await request(base,"/api/legal/reconfirmation",ownerCookie,"POST",{acceptedDocumentVersionIds:[changed.data.documents[0].id]})).status,200);
 assert.equal(data.prepare("SELECT count(*) AS n FROM legal_acknowledgements WHERE user_id=? AND document_key='agb'").get(ownerId).n,2,"Alte Bestätigung muss erhalten bleiben.");
 assert.equal(data.prepare("SELECT count(*) AS n FROM audit_logs WHERE actor_user_id=? AND action='legal_documents.reconfirmed'").get(ownerId).n,2);
 assert.equal((await request(base,"/api/auth/me",consumerCookie)).status,403,"Privatkonten dürfen keinen Web-Zugang erhalten.");
 const consumerBefore=await request(base,"/api/auth/me",consumerCookie,"GET",undefined,true);
 assert.equal(consumerBefore.status,200);assert.equal(consumerBefore.data.legalUpdateRequired,true);
 assert.equal((await request(base,"/api/events",consumerCookie)).status,200,"Laufende Privat-Events bleiben lesbar.");
 assert.equal((await request(base,"/api/events",consumerCookie,"POST",{},true)).status,428);
 const consumerReview=await request(base,"/api/legal/reconfirmation",consumerCookie,"GET",undefined,true);
 assert.equal(consumerReview.status,200);assert.deepEqual(consumerReview.data.documents.map(row=>row.documentKey),["agb_b2c","datenschutz","widerruf"]);
 assert.equal((await request(base,"/api/legal/reconfirmation",consumerCookie,"POST",{acceptedDocumentVersionIds:consumerReview.data.documents.map(row=>row.id)})).status,403);
 assert.equal((await request(base,"/api/legal/reconfirmation",consumerCookie,"POST",{acceptedDocumentVersionIds:consumerReview.data.documents.map(row=>row.id)},true)).status,200);
 assert.equal((await request(base,"/api/auth/me",consumerCookie,"GET",undefined,true)).data.legalUpdateRequired,false);
 assert.equal(data.prepare("SELECT count(*) AS n FROM legal_acknowledgements WHERE user_id=?").get(consumerId).n,3);
 const privacyContent="Testfassung datenschutz 2",privacyAt=Date.now();
 const priorPrivacy=data.prepare("SELECT id FROM legal_document_versions WHERE document_key='datenschutz' AND version='1'").get();
 data.prepare("UPDATE legal_document_versions SET archived_at=? WHERE id=?").run(privacyAt,priorPrivacy.id);
 data.prepare("INSERT INTO legal_document_versions (id,document_key,title,version,content,content_hash,published_at,created_at) VALUES (?,?,?,?,?,?,?,?)").run(`ldv-${randomUUID()}`,"datenschutz","DATENSCHUTZ","2",privacyContent,hash(privacyContent),privacyAt,privacyAt);
 data.prepare("UPDATE legal_documents SET version='2',content=?,updated_at=? WHERE document_key='datenschutz'").run(privacyContent,privacyAt);
 const privacyReview=await request(base,"/api/legal/reconfirmation",consumerCookie,"GET",undefined,true);
 assert.equal(privacyReview.data.documents.length,1);assert.equal(privacyReview.data.documents[0].documentKey,"datenschutz");
 assert.equal((await request(base,"/api/legal/reconfirmation",consumerCookie,"POST",{acceptedDocumentVersionIds:[privacyReview.data.documents[0].id]},true)).status,200);
 assert.equal(data.prepare("SELECT count(*) AS n FROM legal_acknowledgements WHERE user_id=? AND document_key='datenschutz'").get(consumerId).n,2);
 data.close();
 process.stdout.write("Rechtstext-Test bestanden: Organisations- und Privatkonten, Event-Sperre, laufende Events, Versionierung und Nachweise.\n");
}finally{
 if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>{server.once("exit",resolve);setTimeout(resolve,3000)})}
 const resolved=path.resolve(temporary);
 if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith("rescueed-legal-test-"))await rm(resolved,{recursive:true,force:true});
}
