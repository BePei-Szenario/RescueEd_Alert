import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const required = ["DATABASE_PATH", "BACKUP_DIR", "BACKUP_ENCRYPTION_KEY", "EMAIL_PAYLOAD_KEY", "APP_SUBSCRIPTION_KEY", "PUBLIC_BASE_URL", "MAIL_FROM_MFA", "MAIL_FROM_CONTACT", "MSMTP_CONFIG"];
let failed = false;
for (const name of required) {
  if (!process.env[name]) { process.stderr.write(`FEHLT: ${name}\n`); failed = true; }
}
const file = process.env.DATABASE_PATH;
if (file && !path.isAbsolute(file)) { process.stderr.write("DATABASE_PATH muss absolut sein.\n"); failed = true; }
const backupDir = process.env.BACKUP_DIR;
if (backupDir && (!path.isAbsolute(backupDir) || path.resolve(backupDir) === path.parse(backupDir).root || (file && path.resolve(backupDir) === path.dirname(path.resolve(file))))) { process.stderr.write("BACKUP_DIR muss ein separates absolutes Verzeichnis sein.\n"); failed = true; }
if (backupDir && !existsSync(backupDir)) { process.stderr.write("BACKUP_DIR fehlt: vor dem Start mit Modus 0700 anlegen.\n"); failed = true; }
if (backupDir && existsSync(backupDir) && process.platform !== "win32" && (statSync(backupDir).mode & 0o077)) { process.stderr.write("BACKUP_DIR muss Modus 0700 haben.\n"); failed = true; }
if (file && existsSync(file) && process.platform !== "win32") {
  const mode = statSync(file).mode & 0o777;
  if (mode & 0o077) { process.stderr.write("Datenbankdatei darf nicht für Gruppe/Andere lesbar sein.\n"); failed = true; }
}
if (file && !existsSync(file)) { process.stderr.write("Datenbank fehlt: erst db:migrate ausführen.\n"); failed = true; }
if (file && existsSync(file)) {
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    const allowed = new Set([process.env.MAIL_FROM_MFA?.toLowerCase(), process.env.MAIL_FROM_CONTACT?.toLowerCase()]);
    for (const row of db.prepare("SELECT action, sender_email FROM email_sender_settings").all()) {
      if (!allowed.has(row.sender_email.toLowerCase())) {
        process.stderr.write(`E-Mail-Absender für ${row.action} ist nicht einem msmtp-Konto zugeordnet.\n`);
        failed = true;
      }
    }
    db.close();
  } catch (error) {
    process.stderr.write(`Datenbankschema nicht bereit: ${error.message}\n`);
    failed = true;
  }
}
const emailKey = process.env.EMAIL_PAYLOAD_KEY || "";
const emailKeyBytes = /^[0-9a-f]{64}$/i.test(emailKey) ? Buffer.from(emailKey, "hex") : Buffer.from(emailKey, "base64");
if (emailKeyBytes.length !== 32) { process.stderr.write("EMAIL_PAYLOAD_KEY muss 32 Byte enthalten.\n"); failed = true; }
const backupKey = process.env.BACKUP_ENCRYPTION_KEY || "";
if ((/^[0-9a-f]{64}$/i.test(backupKey) ? Buffer.from(backupKey,"hex") : Buffer.from(backupKey,"base64")).length !== 32) { process.stderr.write("BACKUP_ENCRYPTION_KEY muss 32 Byte enthalten.\n"); failed = true; }
if (Buffer.from(process.env.APP_SUBSCRIPTION_KEY || "", "base64").length !== 32) { process.stderr.write("APP_SUBSCRIPTION_KEY muss 32 Byte Base64 enthalten.\n"); failed = true; }
const msmtp = process.env.MSMTP_CONFIG;
if (msmtp && !path.isAbsolute(msmtp)) { process.stderr.write("MSMTP_CONFIG muss ein absoluter Pfad sein.\n"); failed = true; }
if (msmtp && !existsSync(msmtp)) { process.stderr.write("MSMTP_CONFIG fehlt.\n"); failed = true; }
if (msmtp && existsSync(msmtp) && process.platform !== "win32" && (statSync(msmtp).mode & 0o077)) { process.stderr.write("MSMTP_CONFIG muss Modus 0600 haben.\n"); failed = true; }
const url = process.env.PUBLIC_BASE_URL;
if (url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.origin !== url.replace(/\/$/, "") || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error();
  } catch {
    process.stderr.write("PUBLIC_BASE_URL muss eine HTTPS-Origin ohne Pfad sein.\n"); failed = true;
  }
}
if (Number(process.version.match(/^v(\d+)/)?.[1] || 0) < 24) {
  process.stderr.write("Node.js 24 oder neuer ist für node:sqlite erforderlich.\n"); failed = true;
}
if (failed) process.exit(1);
process.stdout.write("VPS-Konfiguration: Grundprüfung bestanden. E-Mail-Zustellung, Store und Restore separat prüfen.\n");
