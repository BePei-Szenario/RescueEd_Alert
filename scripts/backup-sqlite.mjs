import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, realpath, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

const database = process.env.DATABASE_PATH;
const destination = process.env.BACKUP_DIR;
const keyText = process.env.BACKUP_ENCRYPTION_KEY || "";
const key = /^[0-9a-f]{64}$/i.test(keyText) ? Buffer.from(keyText, "hex") : Buffer.from(keyText, "base64");
if (!database || !destination || !path.isAbsolute(database) || !path.isAbsolute(destination) || key.length !== 32) {
  throw new Error("DATABASE_PATH und BACKUP_DIR müssen absolute Pfade sein; BACKUP_ENCRYPTION_KEY muss 32 zufällige Byte enthalten.");
}
if (path.resolve(destination) === path.parse(destination).root || path.resolve(destination) === path.dirname(path.resolve(database))) {
  throw new Error("BACKUP_DIR darf weder das Dateisystem-Root noch das Datenbankverzeichnis sein.");
}
await mkdir(destination, { recursive: true, mode: 0o700 });
const backupDir = await realpath(destination);
const databaseFile = await realpath(database);
if (backupDir === path.dirname(databaseFile) || (process.platform !== "win32" && ((await stat(backupDir)).mode & 0o077))) {
  throw new Error("BACKUP_DIR muss getrennt von der Datenbank und nur für den Dienstnutzer zugänglich sein (0700).");
}
// An interrupted earlier run can leave a private plaintext temporary file.
for (const entry of await readdir(backupDir)) {
  if (!/^\.rescueed-\d{8}T\d{6}Z-[a-f0-9]{12}\.sqlite\.enc\.sqlite\.tmp$/.test(entry)) continue;
  const target = path.resolve(backupDir, entry);
  if (path.dirname(target) !== backupDir) continue;
  const details = await lstat(target);
  if (details.isFile() && details.mtimeMs < Date.now() - 86400000) await unlink(target);
}
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
const name = `rescueed-${stamp}-${nonce}.sqlite.enc`;
const plain = path.join(backupDir, `.${name}.sqlite.tmp`);
const encrypted = path.join(backupDir, `.${name}.tmp`);
const complete = path.join(backupDir, name);
let source;
let output;
async function writeAll(file, buffer) {
  let offset = 0;
  while (offset < buffer.length) offset += (await file.write(buffer, offset)).bytesWritten;
}
try {
  source = new DatabaseSync(databaseFile, { readOnly: true });
  await backup(source, plain);
  source.close(); source = undefined;
  await chmod(plain, 0o600);
  const check = new DatabaseSync(plain, { readOnly: true });
  try {
    if (check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("SQLite-Backup ist nicht konsistent.");
  } finally { check.close(); }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  output = await open(encrypted, "wx", 0o600);
  await writeAll(output, Buffer.concat([Buffer.from("RA-BACKUP-1"), iv]));
  for await (const chunk of createReadStream(plain).pipe(cipher)) await writeAll(output, chunk);
  await writeAll(output, cipher.getAuthTag());
  await output.sync();
  await output.close(); output = undefined;
  await rename(encrypted, complete);
  // Runs daily: pruning after 29 days keeps the effective maximum below 30 days.
  const cutoff = Date.now() - 29 * 86400000;
  let removed = 0;
  for (const entry of await readdir(backupDir)) {
    const match = /^rescueed-(\d{8}T\d{6}Z)-[a-f0-9]{12}\.sqlite\.enc$/.exec(entry);
    if (!match) continue;
    const timestamp = Date.parse(match[1].replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"));
    if (!Number.isFinite(timestamp) || timestamp >= cutoff) continue;
    const target = path.resolve(backupDir, entry);
    if (path.dirname(target) !== backupDir || !(await lstat(target)).isFile()) continue;
    await unlink(target);
    removed++;
  }
  process.stdout.write(`${JSON.stringify({event:"backup_completed",file:name,removedExpired:removed})}\n`);
} finally {
  source?.close();
  await output?.close();
  await unlink(plain).catch(error => { if (error.code !== "ENOENT") throw error; });
  await unlink(encrypted).catch(error => { if (error.code !== "ENOENT") throw error; });
}
