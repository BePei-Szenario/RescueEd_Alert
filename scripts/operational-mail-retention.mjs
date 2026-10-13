// Called inside the maintenance transaction. Do not touch statutory billing records.
export function purgeOperationalMail(db, now = Date.now()) {
  const day = 86400000;
  const invitations = db.prepare("DELETE FROM duty_invitations WHERE used_at IS NULL AND expires_at<=?").run(now).changes;
  // Legacy invitation mail had a seven-day payload lifetime: cap it at 24 hours too.
  const invitationMail = db.prepare(`DELETE FROM email_outbox WHERE type='duty_invitation'
    AND (created_at<=? OR (sensitive_expires_at IS NOT NULL AND sensitive_expires_at<=?))`).run(now-day,now).changes;
  // The detached final PDF is only a delivery buffer, never an archive.
  const summaries = db.prepare(`DELETE FROM email_outbox WHERE type='event_deletion_summary'
    AND (status IN ('sent','failed') OR payload_json='{}'
      OR COALESCE(sensitive_expires_at,created_at+?)<=?)`).run(7*day,now).changes;
  return {invitationsDeleted:Number(invitations),invitationMailsDeleted:Number(invitationMail),summaryMailsDeleted:Number(summaries)};
}

export function deleteCompletedSummary(db, row) {
  if (row.type !== 'event_deletion_summary') return false;
  db.prepare("DELETE FROM email_outbox WHERE id=? AND type='event_deletion_summary'").run(row.id);
  return true;
}
