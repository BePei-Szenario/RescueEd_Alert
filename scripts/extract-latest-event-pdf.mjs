import {createDecipheriv} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {mkdirSync,readdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const databaseDirectory=resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const databaseFile=readdirSync(databaseDirectory).find(name=>name.endsWith(".sqlite")&&name!=="metadata.sqlite");
if(!databaseFile)throw new Error("Lokale D1-Datenbank nicht gefunden.");
const db=new DatabaseSync(resolve(databaseDirectory,databaseFile),{readOnly:true});
const row=db.prepare("SELECT id,type,payload_json FROM email_outbox WHERE type = 'event_deletion_summary' ORDER BY created_at DESC LIMIT 1").get();
db.close();
if(!row)throw new Error("Kein Eventabschluss im E-Mail-Ausgang gefunden.");
function decryptPayload(record){
 const envelope=JSON.parse(record.payload_json);
 if(envelope.alg!=="A256GCM")return envelope;
 const configured=process.env.EMAIL_PAYLOAD_KEY||"",key=/^[0-9a-f]{64}$/i.test(configured)?Buffer.from(configured,"hex"):Buffer.from(configured,"base64");
 if(key.length!==32)throw new Error("EMAIL_PAYLOAD_KEY mit 32 Byte ist zum Lesen des verschlüsselten Eventabschlusses erforderlich.");
 const expected=`rescueed-email:v1:${record.type}:${record.id}`;
 if(envelope.aad!==expected)throw new Error("E-Mail-AAD stimmt nicht überein.");
 const bytes=Buffer.from(envelope.ciphertext,"base64"),decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(envelope.iv,"base64"));
 decipher.setAAD(Buffer.from(expected));decipher.setAuthTag(bytes.subarray(bytes.length-16));
 return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]).toString("utf8"));
}
const payload=decryptPayload(row),attachment=payload.attachment;
if(!attachment?.data||attachment.contentType!=="application/pdf")throw new Error("Der letzte E-Mail-Auftrag enthält keine PDF.");
const outputDirectory=resolve("output/pdf");mkdirSync(outputDirectory,{recursive:true});
const outputFile=resolve(outputDirectory,"rescueed-eventabschluss-geprueft.pdf");
writeFileSync(outputFile,Buffer.from(attachment.data,"base64"));
console.log(outputFile);
