"use client";
import {useState} from "react";

const roles = {helper_attendance: "Helferlogin", helper_recorder: "Nur Helfererfassung", alarm_operator: "Nur Alarmierungsplattform", event_manager: "Alarmierung mit Verwaltung"};

export function EventAccessCodeCreate({eventId, existingRoles, onCreated}: {eventId: string; existingRoles: string[]; onCreated: () => Promise<void>}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const missing = Object.entries(roles).filter(([role]) => !existingRoles.includes(role));
  async function create(role: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/access-codes`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({role})});
      const result = await response.json() as {error?: string};
      if (!response.ok) throw new Error(result.error || "Code konnte nicht erstellt werden.");
      await onCreated();
    } catch (reason) {setError(reason instanceof Error ? reason.message : "Code konnte nicht erstellt werden.");}
    finally {setBusy(false);}
  }
  return <section><h3>Zugangscode ergänzen</h3><p>Gültig bis zum Eventende. Bestehende Codes und angemeldete Helfer bleiben unverändert.</p>
    {missing.length ? missing.map(([role, label]) => <button type="button" key={role} disabled={busy} onClick={() => void create(role)}>{label}: Code erstellen</button>) : <p>Für alle Zugangsarten sind bereits Codes vorhanden.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
