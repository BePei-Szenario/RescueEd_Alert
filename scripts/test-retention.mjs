import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const temporary = await mkdtemp(path.join(os.tmpdir(), "rescueed-retention-test-"));
const database = path.join(temporary, "database.sqlite");
const backupDir = path.join(temporary, "backups");
const key = randomBytes(32).toString("base64");
function run(script, args = [], extra = {}) {
  const result = spawnSync(process.execPath, [path.join(import.meta.dirname, script), ...args], {
    env: {...process.env, DATABASE_PATH:database, BACKUP_DIR:backupDir, BACKUP_ENCRYPTION_KEY:key, ...extra},
    encoding:"utf8", timeout:30000,
  });
  assert.equal(result.status, 0, `${script}: ${result.stderr || result.error?.message || result.stdout}`);
  return result.stdout;
}
try {
  const legacy = path.join(temporary, "legacy.sqlite");
  const oldDb = new DatabaseSync(legacy);
  oldDb.exec("PRAGMA foreign_keys=ON; CREATE TABLE _rescueed_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)");
  for (const name of readdirSync(path.join(import.meta.dirname, "..", "drizzle")).filter(name => /^00(?:0\d|1[0-6])_.+\.sql$/.test(name)).sort()) {
    const sql = readFileSync(path.join(import.meta.dirname, "..", "drizzle", name), "utf8");
    oldDb.exec(sql);
    oldDb.prepare("INSERT INTO _rescueed_migrations VALUES (?,?,?)").run(name, createHash("sha256").update(sql).digest("hex"), new Date().toISOString());
  }
  const booked = Date.UTC(2026, 8, 10);
  oldDb.prepare("INSERT INTO organizations (id,name,billing_email,created_at) VALUES (?,?,?,?)").run("org-legacy","Altorganisation","billing@example.test",booked);
  oldDb.prepare("INSERT INTO users (id,organization_id,full_name,email,password_hash,created_at) VALUES (?,?,?,?,?,?)").run("user-legacy","org-legacy","Erika Beispiel","erika@example.test","hash",booked);
  oldDb.prepare("INSERT INTO events (id,organization_id,owner_user_id,name,event_date,helper_limit,price_cents,public_join_token_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run("event-legacy","org-legacy","user-legacy","Alte Veranstaltung","2026-09-10",20,599,"join-legacy",booked);
  oldDb.prepare("INSERT INTO invoice_requests (id,event_id,recipient_name,street,postal_code,city,email,amount_cents,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run("invoice-legacy","event-legacy","Rechnungsempfänger","Beispielstraße 1","12345","Ort","billing@example.test",599,booked);
  oldDb.prepare("INSERT INTO deleted_customer_archives (id,source_user_id,source_organization_id,full_name,email,organization_name,billing_email,legal_snapshot_json,account_created_at,deleted_at,retention_review_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run("archive-legacy","user-legacy","org-legacy","Erika Beispiel","erika@example.test","Altorganisation","billing@example.test",'{"accountType":"organization"}',booked,booked,booked,booked);
  oldDb.close();
  run("migrate-sqlite.mjs", [], {DATABASE_PATH:legacy});
  const migrated = new DatabaseSync(legacy);
  const backfilled = migrated.prepare("SELECT customer_name,recipient_name,retain_until FROM billing_records WHERE id='invoice-legacy'").get();
  assert.equal(backfilled.customer_name, "Erika Beispiel");
  assert.equal(backfilled.recipient_name, "Rechnungsempfänger");
  assert.equal(backfilled.retain_until, Date.UTC(2035, 0, 1));
  assert.equal(migrated.prepare("SELECT retention_review_at FROM deleted_customer_archives WHERE id='archive-legacy'").get().retention_review_at, Date.UTC(2030, 0, 1));
  assert.ok(!migrated.prepare("PRAGMA table_info(deleted_customer_archives)").all().some(column => column.name === "billing_email"));
  migrated.close();

  run("migrate-sqlite.mjs");
  const db = new DatabaseSync(database);
  db.exec("PRAGMA foreign_keys=ON");
  const now = Date.now(), old = Date.UTC(2020, 0, 1), recent = now - 3600000;
  db.prepare("INSERT INTO app_crash_reports VALUES (?,?,?,?,?,?,?,?,?)").run("crash-old","android","1.0","flutter","Test","#0 stack","hash",old,old);
  db.prepare("INSERT INTO app_crash_reports VALUES (?,?,?,?,?,?,?,?,?)").run("crash-new","android","1.0","flutter","Test","#0 stack","hash",recent,recent);
  db.prepare("INSERT INTO auth_rate_limits VALUES (?,?,?,?,?,?)").run("limit-old","app-crash-ip",1,old,null,old);
  db.prepare("INSERT INTO auth_rate_limits VALUES (?,?,?,?,?,?)").run("limit-new","app-crash-ip",1,recent,null,recent);
  db.prepare("INSERT INTO support_tickets (id,requester_type,subject,status,resolved_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("ticket-old","helper","Alt","resolved",old,old,old);
  db.prepare("INSERT INTO support_tickets (id,requester_type,subject,status,resolved_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("ticket-open-old","helper","Alte offene Helferfrage","open",null,old,old);
  db.prepare("INSERT INTO support_tickets (id,requester_type,subject,status,resolved_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("ticket-open-recent","helper","Aktuelle Helferfrage","open",null,old,recent);
  db.prepare("INSERT INTO support_tickets (id,requester_type,subject,status,resolved_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("ticket-user-old","user","Alte offene Kundenfrage","open",null,old,old);
  db.prepare("INSERT INTO support_tickets (id,requester_type,subject,status,resolved_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("ticket-held","helper","Streitfall","open",null,old,old);
  db.prepare("INSERT INTO retention_holds (id,entity_type,entity_id,reason,reference,created_at) VALUES (?,?,?,?,?,?)").run("hold-ticket","support_ticket","ticket-held","Streitfall","AZ-2",now);
  db.prepare("INSERT INTO deleted_customer_archives (id,source_user_id,source_organization_id,full_name,email,organization_name,legal_snapshot_json,account_created_at,deleted_at,retention_review_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("archive-old","u1","o1","Alt","alt@example.test","Org","{}",old,old,old,old);
  db.prepare("INSERT INTO retention_holds (id,entity_type,entity_id,reason,reference,created_at) VALUES (?,?,?,?,?,?)").run("hold-1","contract_evidence","archive-old","Streitfall","AZ-1",now);
  db.prepare("INSERT INTO billing_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("billing-old","Alt","Org","Org","Straße","12345","Ort","alt@example.test","Event","2020-01-01",20,599,"EUR",old,old);
  db.prepare("INSERT INTO privacy_request_records VALUES (?,?,?,?,?,?,?)").run("privacy-old","hash","erasure","completed",old,old,old);
  db.close();
  run("purge-diagnostics.mjs");
  const after = new DatabaseSync(database);
  assert.equal(after.prepare("SELECT count(*) AS n FROM app_crash_reports").get().n, 1);
  assert.equal(after.prepare("SELECT count(*) AS n FROM auth_rate_limits").get().n, 1);
  assert.equal(after.prepare("SELECT count(*) AS n FROM support_tickets").get().n, 2);
  assert.equal(after.prepare("SELECT count(*) AS n FROM billing_records").get().n, 0);
  assert.equal(after.prepare("SELECT count(*) AS n FROM privacy_request_records").get().n, 0);
  assert.equal(after.prepare("SELECT count(*) AS n FROM deleted_customer_archives").get().n, 1);
  assert.equal(after.prepare("SELECT count(*) AS n FROM retention_runs").get().n, 1);
  assert.equal(after.prepare("SELECT count(*) AS n FROM retention_actions WHERE action='deleted'").get().n, 5);
  assert.equal(after.prepare("SELECT count(*) AS n FROM support_tickets WHERE id='ticket-open-recent'").get().n, 1);
  assert.equal(after.prepare("SELECT count(*) AS n FROM support_tickets WHERE id='ticket-held'").get().n, 1);
  after.close();
  run("manage-retention-hold.mjs", ["release","contract_evidence","archive-old","AZ-1","Fall abgeschlossen"]);
  run("manage-retention-hold.mjs", ["release","support_ticket","ticket-held","AZ-2","Fall abgeschlossen"]);
  run("purge-diagnostics.mjs");
  const final = new DatabaseSync(database);
  assert.equal(final.prepare("SELECT count(*) AS n FROM deleted_customer_archives").get().n, 0);
  assert.equal(final.prepare("SELECT count(*) AS n FROM support_tickets").get().n, 1);
  assert.equal(final.prepare("SELECT count(*) AS n FROM retention_actions WHERE action='deleted'").get().n, 7);
  final.close();
  await mkdir(backupDir);
  const expiredBackup = path.join(backupDir, "rescueed-20200101T000000Z-abcdef123456.sqlite.enc");
  writeFileSync(expiredBackup, "expired test backup");
  run("backup-sqlite.mjs");
  assert.ok(!existsSync(expiredBackup), "Lokale Backups über 29 Tage müssen entfernt werden.");
  const encrypted = readdirSync(backupDir).find(name => name.endsWith(".sqlite.enc"));
  assert.ok(encrypted);
  const restored = path.join(temporary, "restored.sqlite");
  run("verify-backup.mjs", [path.join(backupDir, encrypted), restored]);
  assert.ok(existsSync(restored));
  const rejected = path.join(temporary, "wrong-key.sqlite");
  const wrongKey = spawnSync(process.execPath, [path.join(import.meta.dirname, "verify-backup.mjs"), path.join(backupDir, encrypted), rejected], {
    env:{...process.env, BACKUP_ENCRYPTION_KEY:randomBytes(32).toString("base64"), DATABASE_PATH:database},encoding:"utf8",timeout:30000,
  });
  assert.notEqual(wrongKey.status, 0, "Falscher Backup-Schlüssel muss abgewiesen werden.");
  assert.ok(!existsSync(rejected), "Nach fehlgeschlagener Entschlüsselung darf keine Testdatenbank bleiben.");
  process.stdout.write("Retention-, Legal-Hold- und Backup-/Restore-Test bestanden.\n");
} finally {
  const resolved = path.resolve(temporary);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("rescueed-retention-test-")) {
    await rm(resolved, {recursive:true, force:true});
  }
}
