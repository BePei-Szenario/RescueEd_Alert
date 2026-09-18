import { randomUUID, pbkdf2Sync } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const file = process.env.DATABASE_PATH;
const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
const passwordFile = process.env.BOOTSTRAP_OWNER_PASSWORD_FILE;
if (!file || !email || !passwordFile || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("DATABASE_PATH, BOOTSTRAP_OWNER_EMAIL und BOOTSTRAP_OWNER_PASSWORD_FILE setzen.");
if (process.platform !== "win32" && (statSync(passwordFile).mode & 0o077)) throw new Error("Die Passwortdatei muss Modus 0600 haben.");
const password = readFileSync(passwordFile, "utf8").trimEnd();
if (password.length < 16 || password.length > 1024) throw new Error("Initialpasswort muss 16 bis 1024 Zeichen lang sein.");
const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
try {
  if (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='platform_owner'").get().n !== 0) throw new Error("Ein Betreiberkonto existiert bereits. Bootstrap ist nur einmal möglich.");
  if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) throw new Error("E-Mail-Adresse ist bereits vergeben.");
  const salt = randomUUID();
  const hash = pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex");
  const organizationId = `org_${randomUUID()}`, userId = `usr_${randomUUID()}`, now = Date.now();
  db.prepare("INSERT INTO organizations (id,name,billing_email,created_at) VALUES (?,?,?,?)").run(organizationId, "RescueEd", email, now);
  db.prepare("INSERT INTO users (id,organization_id,full_name,email,password_hash,account_type,role,status,mfa_enabled,protected_account,email_verified_at,created_at) VALUES (?,?,?,?,?,'organization','platform_owner','active',1,1,?,?)").run(userId, organizationId, process.env.BOOTSTRAP_OWNER_NAME || "RescueEd Betreiber", email, `pbkdf2-sha256$210000$${salt}$${hash}`, now, now);
  db.exec("COMMIT");
  process.stdout.write("Betreiberkonto erstellt. Passwortdatei jetzt sicher entfernen; MFA-E-Mail-Zustellung prüfen.\n");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
