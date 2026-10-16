import type {DatabaseSync} from "node:sqlite";

export const additionalAccessRoles = ["helper_attendance", "helper_recorder", "alarm_operator", "event_manager"] as const;
export type AdditionalAccessRole = typeof additionalAccessRoles[number];

// Call only inside withImmediateTransaction. Never update existing codes or sessions.
export function insertMissingEventAccessCode(connection: DatabaseSync, input: {
  eventId: string; userId: string; organizationId: string; role: AdditionalAccessRole;
  id: string; hash: string; encrypted: string;
}, now = Date.now()) {
  if (!additionalAccessRoles.includes(input.role)) return {status: 400, error: "Ungültige Zugangsart."};
  const event = connection.prepare("SELECT owner_user_id, organization_id, status, event_date, end_date, start_time, end_time FROM events WHERE id = ?").get(input.eventId);
  if (!event) return {status: 404, error: "Event nicht gefunden."};
  if (event.owner_user_id !== input.userId || event.organization_id !== input.organizationId) return {status: 403, error: "Nur der Event-Ersteller darf Zugangscodes erstellen."};
  let endDate = String(event.end_date || event.event_date);
  if (!event.end_date && event.start_time && event.end_time && String(event.end_time) <= String(event.start_time)) {
    const next = new Date(`${endDate}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    endDate = next.toISOString().slice(0, 10);
  }
  // Same calendar/time convention as codes generated during event creation.
  const expiresAt = new Date(`${endDate}T${event.end_time}:00`).getTime();
  if (event.status !== "active" || !Number.isFinite(expiresAt) || expiresAt <= now) return {status: 409, error: "Für beendete Events können keine Zugangscodes erstellt werden."};
  const existing = connection.prepare("SELECT id FROM event_access_codes WHERE event_id = ? AND role = ?").get(input.eventId, input.role);
  if (existing) return {status: 409, error: "Für diese Zugangsart existiert bereits ein Code. Er bleibt unverändert."};
  connection.prepare("INSERT INTO event_access_codes (id, event_id, role, code_hash, code_encrypted, expires_at, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(input.id, input.eventId, input.role, input.hash, input.encrypted, expiresAt, input.userId, now);
  return {status: 201, expiresAt};
}
