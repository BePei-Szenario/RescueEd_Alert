import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const [action, type, entityId, reference, ...reasonParts] = process.argv.slice(2);
const reason = reasonParts.join(" ").trim();
const table = {support_ticket:"support_tickets",contract_evidence:"deleted_customer_archives",billing_record:"billing_records",privacy_request:"privacy_request_records"}[type];
if (!table || !entityId || !reference || !reason || !["add","release"].includes(action)) {
  throw new Error("Aufruf: node scripts/manage-retention-hold.mjs add|release support_ticket|contract_evidence|billing_record|privacy_request ID AKTENZEICHEN BEGRÜNDUNG");
}
if (entityId.length > 100 || reference.length > 120 || reason.length > 500) throw new Error("Eingabe zu lang.");
const file = process.env.DATABASE_PATH;
if (!file || !path.isAbsolute(file)) throw new Error("DATABASE_PATH muss absolut sein.");
const db = new DatabaseSync(file);
try {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
  const target = db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(entityId);
  if (!target) throw new Error("Datensatz nicht gefunden.");
  const active = db.prepare("SELECT id FROM retention_holds WHERE entity_type=? AND entity_id=? AND released_at IS NULL").get(type, entityId);
  if (action === "add") {
    if (active) throw new Error("Für diesen Datensatz besteht bereits eine aktive Aufbewahrungssperre.");
    db.prepare("INSERT INTO retention_holds (id,entity_type,entity_id,reason,reference,created_at) VALUES (?,?,?,?,?,?)")
      .run(randomUUID(), type, entityId, reason, reference, Date.now());
  } else {
    if (!active) throw new Error("Keine aktive Aufbewahrungssperre vorhanden.");
    db.prepare("UPDATE retention_holds SET released_at=? WHERE id=?").run(Date.now(), active.id);
    db.prepare("INSERT INTO audit_logs (id,actor_user_id,action,entity_type,entity_id,metadata_json,created_at) VALUES (?,NULL,?,?,?,?,?)")
      .run(randomUUID(), "retention.hold_released", type, entityId, JSON.stringify({reference,reason}), Date.now());
  }
  const now = Date.now(), retainUntil = Date.UTC(new Date(now).getUTCFullYear() + 4, 0, 1);
  db.prepare("INSERT INTO retention_actions (id,entity_type,entity_hash,action,created_at,retain_until) VALUES (?,?,?,?,?,?)")
    .run(randomUUID(), type, createHash("sha256").update(entityId).digest("hex"), action === "add" ? "hold_set" : "hold_released", now, retainUntil);
  db.exec("COMMIT");
  process.stdout.write(`Aufbewahrungssperre ${action === "add" ? "gesetzt" : "aufgehoben"}: ${type} ${entityId}\n`);
} catch (error) {
  if (db.isTransaction) db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
