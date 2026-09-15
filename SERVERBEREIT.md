# RescueEd Alert – Serverbetrieb

Die Anwendung ist für Cloudflare Workers mit D1 gebaut. Der Produktions-Build liegt nach `npm run build` in `dist/server`; der Worker-Einstieg ist `dist/server/index.js`.

## Vor dem ersten Start

1. Eine D1-Datenbank an die Bindung `DB` anschließen.
2. Die SQL-Dateien in `drizzle/` in aufsteigender Reihenfolge anwenden.
3. Das erste Betreiberkonto einmalig als normalen Benutzer anlegen und dessen Rolle direkt in D1 auf `platform_owner` setzen. Diese Rollenänderung darf nie über eine öffentliche Route angeboten werden.
4. HTTPS erzwingen. Produktions-Sitzungscookies werden nur über HTTPS übertragen.
5. Einen E-Mail-Worker an `email_outbox` anschließen. Die internen Typen umfassen unter anderem `customer_contact` und `mfa`; in der Oberfläche und Kommunikation heißt `mfa` ausschließlich „Sicherheitscode“. Nach erfolgreicher Übergabe `status='sent'` und `sent_at` setzen; Protokolle dürfen keine Sicherheitscodes oder Passwort-Tokens enthalten.

## Sicherheitsbetrieb

- Unternehmerzugriff: `/unternehmer/login`, immer Passwort plus Sicherheitscode.
- Sitzungen laufen nach acht Stunden ab und liegen nur als gehashter Token in der Datenbank.
- Passwortlinks sind einmalig und 30 Minuten gültig.
- Benutzer können im Unternehmerbereich gesperrt werden; bestehende Sitzungen werden dabei beendet.
- Rechnungsstatus und sicherheitsrelevante Änderungen werden im Audit-Log erfasst.
- Regelmäßig abgelaufene Sitzungen und Sicherheitstokens löschen sowie D1-Backups prüfen.

## Lokale Prüfung

`npm run build` erstellt dieselbe Worker-Ausgabe wie für den Server. `npm start` startet die gebaute Anwendung mit dem persistenten lokalen D1-Datenbestand.
