import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const file = process.env.DATABASE_PATH;
if (!file || !path.isAbsolute(file)) throw new Error("DATABASE_PATH muss absolut sein.");
const db = new DatabaseSync(file);
const now = Date.now();
const day = 86400000;
const yearEndDeadline = (column, years) =>
  `CAST(strftime('%s',printf('%04d-01-01',CAST(strftime('%Y',${column}/1000,'unixepoch') AS INTEGER)+${years + 1})) AS INTEGER)*1000`;
const actionRetainUntil = Date.UTC(new Date(now).getUTCFullYear() + 4, 0, 1);
function deleteLogged(entityType, sql, ...args) {
  const rows = db.prepare(`${sql} RETURNING id`).all(...args);
  const insert = db.prepare("INSERT INTO retention_actions (id,entity_type,entity_hash,action,created_at,retain_until) VALUES (?,?,?,?,?,?)");
  for (const row of rows) insert.run(randomUUID(), entityType, createHash("sha256").update(row.id).digest("hex"), "deleted", now, actionRetainUntil);
  return rows.length;
}
try {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
  // Legacy rows used account creation as the helper deadline. Move every
  // deadline forward to at least 30 days after the actual event end.
  db.prepare(`UPDATE events SET delete_helpers_after = COALESCE(ended_at,
    (CAST(strftime('%s',COALESCE(end_date,event_date)||' '||COALESCE(end_time,start_time,'23:59')||':00') AS INTEGER)*1000)
    + CASE WHEN end_date IS NULL AND end_time IS NOT NULL AND start_time IS NOT NULL AND end_time <= start_time THEN ? ELSE 0 END) + ?
    WHERE delete_helpers_after IS NULL OR delete_helpers_after <> COALESCE(ended_at,
    (CAST(strftime('%s',COALESCE(end_date,event_date)||' '||COALESCE(end_time,start_time,'23:59')||':00') AS INTEGER)*1000)
    + CASE WHEN end_date IS NULL AND end_time IS NOT NULL AND start_time IS NOT NULL AND end_time <= start_time THEN ? ELSE 0 END) + ?`)
    .run(day,30*day,day,30*day);
  db.exec("CREATE TEMP TABLE due_helpers (id TEXT PRIMARY KEY)");
  db.prepare(`INSERT INTO due_helpers SELECT h.id FROM helpers h
    INNER JOIN events e ON e.id=h.event_id
    WHERE e.delete_helpers_after IS NOT NULL AND e.delete_helpers_after <= ? LIMIT 1000`).run(now);
  db.prepare("UPDATE support_tickets SET requester_helper_id=NULL WHERE requester_helper_id IN (SELECT id FROM due_helpers)").run();
  db.prepare("DELETE FROM alert_recipients WHERE helper_id IN (SELECT id FROM due_helpers)").run();
  const result = {
    crashReportsDeleted: db.prepare("DELETE FROM app_crash_reports WHERE created_at < ?").run(now - 30 * day).changes,
    // Hourly execution plus a 47-hour threshold keeps hashed network entries below 48 hours.
    rateLimitsDeleted: db.prepare("DELETE FROM auth_rate_limits WHERE updated_at < ? AND (blocked_until IS NULL OR blocked_until < ?)").run(now - 47 * 3600000, now).changes,
    supportTicketsDeleted: deleteLogged("support_ticket", `DELETE FROM support_tickets WHERE id IN (
      SELECT t.id FROM support_tickets t WHERE
      ((t.status='resolved' AND t.resolved_at IS NOT NULL AND ${yearEndDeadline("t.resolved_at", 3)} <= ?)
       OR (t.status<>'resolved' AND ${yearEndDeadline("t.updated_at", 3)} <= ?))
      AND NOT EXISTS (SELECT 1 FROM retention_holds h WHERE h.entity_type='support_ticket' AND h.entity_id=t.id AND h.released_at IS NULL)
      LIMIT 1000)`, now, now),
    contractEvidenceDeleted: deleteLogged("contract_evidence", `DELETE FROM deleted_customer_archives WHERE id IN (
      SELECT a.id FROM deleted_customer_archives a WHERE a.retention_review_at <= ?
      AND NOT EXISTS (SELECT 1 FROM retention_holds h WHERE h.entity_type='contract_evidence' AND h.entity_id=a.id AND h.released_at IS NULL)
      LIMIT 1000)`, now),
    privacyRequestsDeleted: deleteLogged("privacy_request", `DELETE FROM privacy_request_records WHERE id IN (
      SELECT p.id FROM privacy_request_records p WHERE p.retain_until <= ?
      AND NOT EXISTS (SELECT 1 FROM retention_holds h WHERE h.entity_type='privacy_request' AND h.entity_id=p.id AND h.released_at IS NULL)
      LIMIT 1000)`, now),
    helpersDeleted: deleteLogged("helper", "DELETE FROM helpers WHERE id IN (SELECT id FROM due_helpers)"),
    billingRecordsDeleted: 0,
    expiredTokensDeleted: 0,
    outboxPayloadsScrubbed: 0,
  };
  result.contractEvidenceDeleted += deleteLogged("contract_evidence", `DELETE FROM app_subscription_withdrawals WHERE id IN (
    SELECT w.id FROM app_subscription_withdrawals w WHERE w.retain_until <= ?
    AND NOT EXISTS (SELECT 1 FROM retention_holds h WHERE h.entity_type='contract_evidence' AND h.entity_id=w.id AND h.released_at IS NULL)
    LIMIT 1000)`, now);
  // The event-linked operational invoice row must not outlive its independent
  // accounting record's retention deadline either.
  db.prepare(`DELETE FROM invoice_requests WHERE id IN (
      SELECT b.id FROM billing_records b WHERE b.retain_until <= ?
      AND NOT EXISTS (SELECT 1 FROM retention_holds h WHERE h.entity_type='billing_record' AND h.entity_id=b.id AND h.released_at IS NULL)
      LIMIT 1000)`).run(now);
  result.billingRecordsDeleted = deleteLogged("billing_record", `DELETE FROM billing_records WHERE id IN (
      SELECT b.id FROM billing_records b WHERE b.retain_until <= ?
      AND NOT EXISTS (SELECT 1 FROM retention_holds h WHERE h.entity_type='billing_record' AND h.entity_id=b.id AND h.released_at IS NULL)
      LIMIT 1000)`, now);
  result.expiredTokensDeleted += db.prepare("DELETE FROM security_tokens WHERE expires_at <= ?").run(now).changes;
  result.expiredTokensDeleted += db.prepare("DELETE FROM pending_registrations WHERE expires_at <= ?").run(now).changes;
  result.expiredTokensDeleted += db.prepare("DELETE FROM pending_consumer_registrations WHERE expires_at <= ?").run(now).changes;
  result.expiredTokensDeleted += db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now).changes;
  result.expiredTokensDeleted += db.prepare("DELETE FROM event_access_sessions WHERE expires_at <= ?").run(now).changes;
  result.outboxPayloadsScrubbed = db.prepare(`UPDATE email_outbox
    SET payload_json='{}', status=CASE WHEN status IN ('pending','processing') THEN 'failed' ELSE status END
    WHERE payload_json <> '{}' AND (
      (sensitive_expires_at IS NOT NULL AND sensitive_expires_at <= ?)
      OR (sensitive_expires_at IS NULL AND created_at <= ?)
    )`).run(now,now-7*day).changes;
  db.prepare("DELETE FROM retention_actions WHERE retain_until <= ?").run(now);
  db.prepare(`INSERT INTO retention_runs (id,created_at,finished_at,crash_reports_deleted,rate_limits_deleted,support_tickets_deleted,contract_evidence_deleted,billing_records_deleted,privacy_requests_deleted,expired_tokens_deleted)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), now, Date.now(), result.crashReportsDeleted, result.rateLimitsDeleted, result.supportTicketsDeleted, result.contractEvidenceDeleted, result.billingRecordsDeleted, result.privacyRequestsDeleted, result.expiredTokensDeleted);
  db.exec("COMMIT");
  process.stdout.write(`${JSON.stringify({event:"retention_completed",...result})}\n`);
} catch (error) {
  if (db.isTransaction) db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
