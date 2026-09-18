import { createDecipheriv } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [encrypted, target] = process.argv.slice(2);
const keyText = process.env.BACKUP_ENCRYPTION_KEY || "";
const key = /^[0-9a-f]{64}$/i.test(keyText) ? Buffer.from(keyText, "hex") : Buffer.from(keyText, "base64");
if (!encrypted || !target || !path.isAbsolute(encrypted) || !path.isAbsolute(target) || key.length !== 32) {
  throw new Error("Aufruf: node scripts/verify-backup.mjs ABSOLUTER_BACKUPPFAD ABSOLUTER_NEUER_TESTDB_PFAD; BACKUP_ENCRYPTION_KEY erforderlich.");
}
if (path.resolve(target) === path.resolve(encrypted) || (process.env.DATABASE_PATH && path.resolve(target) === path.resolve(process.env.DATABASE_PATH))) {
  throw new Error("Der Testpfad darf weder Backup noch produktive Datenbank überschreiben.");
}
const input = await open(encrypted, "r");
let output;
let created = false;
async function readExact(file, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const {bytesRead} = await file.read(buffer, offset, buffer.length - offset, position + offset);
    if (!bytesRead) throw new Error("Backup-Datei ist unvollständig.");
    offset += bytesRead;
  }
}
try {
  const size = (await stat(encrypted)).size;
  if (size < 40) throw new Error("Backup-Datei ist zu klein.");
  const header = Buffer.alloc(23);
  await readExact(input, header, 0);
  if (header.subarray(0, 11).toString() !== "RA-BACKUP-1") throw new Error("Unbekanntes Backup-Format.");
  const tag = Buffer.alloc(16);
  await readExact(input, tag, size - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(11));
  decipher.setAuthTag(tag);
  output = await open(target, "wx", 0o600);
  created = true;
  for await (const chunk of createReadStream(encrypted, {start:23, end:size-17}).pipe(decipher)) {
    let offset = 0;
    while (offset < chunk.length) offset += (await output.write(chunk, offset)).bytesWritten;
  }
  await output.sync();
  await output.close(); output = undefined;
  const test = new DatabaseSync(target, {readOnly:true});
  try {
    if (test.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("Wiederhergestellte Datenbank ist nicht konsistent.");
  } finally {test.close();}
  process.stdout.write(`Backup erfolgreich entschlüsselt und SQLite-Integrität bestätigt: ${target}\n`);
} catch (error) {
  await output?.close();
  if (created) await unlink(target);
  throw error;
} finally {
  await input.close();
}
