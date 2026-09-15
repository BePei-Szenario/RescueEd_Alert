import {DatabaseSync} from "node:sqlite";
import {mkdirSync,readdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const databaseDirectory=resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const databaseFile=readdirSync(databaseDirectory).find(name=>name.endsWith(".sqlite")&&name!=="metadata.sqlite");
if(!databaseFile)throw new Error("Lokale D1-Datenbank nicht gefunden.");
const db=new DatabaseSync(resolve(databaseDirectory,databaseFile),{readOnly:true});
const row=db.prepare("SELECT payload_json FROM email_outbox WHERE type = 'event_deletion_summary' ORDER BY created_at DESC LIMIT 1").get();
db.close();
if(!row)throw new Error("Kein Eventabschluss im E-Mail-Ausgang gefunden.");
const payload=JSON.parse(row.payload_json),attachment=payload.attachment;
if(!attachment?.data||attachment.contentType!=="application/pdf")throw new Error("Der letzte E-Mail-Auftrag enthält keine PDF.");
const outputDirectory=resolve("output/pdf");mkdirSync(outputDirectory,{recursive:true});
const outputFile=resolve(outputDirectory,"rescueed-eventabschluss-geprueft.pdf");
writeFileSync(outputFile,Buffer.from(attachment.data,"base64"));
console.log(outputFile);
