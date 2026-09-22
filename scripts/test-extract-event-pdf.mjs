import assert from "node:assert/strict";
import {createCipheriv,randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdir,readFile,rm,mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";

const root=path.resolve(import.meta.dirname,".."),temporary=await mkdtemp(path.join(os.tmpdir(),"rescueed-pdf-extract-test-"));
try{
 const databaseDirectory=path.join(temporary,".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
 await mkdir(databaseDirectory,{recursive:true});
 const database=path.join(databaseDirectory,"test.sqlite"),db=new DatabaseSync(database),id="mail-test",type="event_deletion_summary",key=randomBytes(32),iv=randomBytes(12),aad=`rescueed-email:v1:${type}:${id}`,pdf=Buffer.from("%PDF-1.4\n%test\n%%EOF"),payload=JSON.stringify({attachment:{contentType:"application/pdf",data:pdf.toString("base64")}});
 const cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from(aad));const ciphertext=Buffer.concat([cipher.update(payload),cipher.final(),cipher.getAuthTag()]);
 const envelope=JSON.stringify({v:1,alg:"A256GCM",aad,iv:iv.toString("base64"),ciphertext:ciphertext.toString("base64")});
 db.exec("CREATE TABLE email_outbox (id TEXT PRIMARY KEY,type TEXT NOT NULL,payload_json TEXT NOT NULL,created_at INTEGER NOT NULL)");
 db.prepare("INSERT INTO email_outbox VALUES (?,?,?,?)").run(id,type,envelope,Date.now());db.close();
 const result=spawnSync(process.execPath,[path.join(root,"scripts/extract-latest-event-pdf.mjs")],{cwd:temporary,env:{...process.env,EMAIL_PAYLOAD_KEY:key.toString("base64")},encoding:"utf8",timeout:30000});
 assert.equal(result.status,0,result.stderr||result.error?.message||result.stdout);
 assert.deepEqual(await readFile(path.join(temporary,"output/pdf/rescueed-eventabschluss-geprueft.pdf")),pdf);
 process.stdout.write("Verschlüsselter Eventabschluss wurde erfolgreich extrahiert.\n");
}finally{
 await rm(temporary,{recursive:true,force:true,maxRetries:2,retryDelay:100}).catch(error=>{if(process.platform!=="win32"||error?.code!=="EBUSY")throw error});
}
