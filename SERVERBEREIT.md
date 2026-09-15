# RescueEd Alert – Serverbetrieb

Die Anwendung ist für Cloudflare Workers mit D1 gebaut. Der Produktions-Build liegt nach `npm run build` in `dist/server`; der Worker-Einstieg ist `dist/server/index.js`.

> Wichtig: Das ist kein klassisches PHP-/Node-Paket zum direkten Hochladen in Hetzner Webhosting S. Für diesen Build werden eine Cloudflare-Workers-Laufzeit und D1 benötigt. Die Domain `alert-rescueed.de` kann anschließend per DNS mit dem Worker verbunden werden.

## Vor dem ersten Start

1. Eine D1-Datenbank an die Bindung `DB` anschließen.
2. Die SQL-Dateien in `drizzle/` in aufsteigender Reihenfolge anwenden.
3. Ein zufälliges 32-Byte-Geheimnis als Cloudflare-Secret `EMAIL_PAYLOAD_KEY` hinterlegen (Base64 oder 64-stelliges Hex). Dieses Geheimnis niemals in Git, D1 oder Logdateien speichern. Ohne den Schlüssel werden Sicherheitscode-, Registrierungs- und Passwort-E-Mails außerhalb von localhost bewusst nicht in die Warteschlange geschrieben.
4. Das erste Betreiberkonto einmalig als normalen Benutzer anlegen und dessen Rolle direkt in D1 auf `platform_owner` setzen. Diese Rollenänderung darf nie über eine öffentliche Route angeboten werden.
5. HTTPS erzwingen. Produktions-Sitzungscookies werden nur über HTTPS übertragen; HSTS, CSP, Frame-, MIME- und Berechtigungsheader werden von `proxy.ts` gesetzt.
6. Einen E-Mail-Worker an `email_outbox` anschließen. Die internen Typen umfassen unter anderem `customer_contact` und `mfa`; in der Oberfläche und Kommunikation heißt `mfa` ausschließlich „Sicherheitscode“. Sicherheitsrelevante `payload_json`-Werte sind AES-256-GCM-Hüllen mit dem AAD-Schema `rescueed-email:v1:<type>:<mailId>`. Der Worker benötigt ausschließlich zur Entschlüsselung dasselbe `EMAIL_PAYLOAD_KEY`. Nach erfolgreicher Übergabe `status='sent'`, `sent_at` setzen und den sicherheitsrelevanten Payload unverzüglich irreversibel überschreiben. Abgelaufene Werte gemäß `sensitive_expires_at` löschen oder redigieren; Protokolle dürfen weder Payloads noch Sicherheitscodes oder Passwort-Tokens enthalten.

Diese sechs Punkte sind Freischaltvoraussetzungen für den Produktivbetrieb. Insbesondere ist die Anwendung ohne den E-Mail-Worker zwar startfähig, aber Registrierung, Sicherheitscode, Passwortlinks und Abschluss-PDFs werden noch nicht tatsächlich zugestellt.

## Sicherheitsbetrieb

- Unternehmerzugriff: `/unternehmer/login`, immer Passwort plus Sicherheitscode.
- Der Sicherheitscode ist an eine zufällige, zehn Minuten gültige Anmelde-Challenge gebunden. Ein erneuter Code kann nicht allein mit einer E-Mail-Adresse ausgelöst werden.
- Login, Sicherheitscode, Registrierung, Passwortlinks und öffentliche Anwesenheit sind serverseitig begrenzt; wiederholte Überschreitungen liefern HTTP 429.
- Sitzungen laufen nach acht Stunden ab und liegen nur als gehashter Token in der Datenbank.
- Passwortlinks sind einmalig und 30 Minuten gültig.
- Benutzer können im Unternehmerbereich gesperrt werden; bestehende Sitzungen werden dabei beendet.
- Rechnungsstatus und sicherheitsrelevante Änderungen werden im Audit-Log erfasst.
- Eventzugriff wird pro Eigentümer beziehungsweise später ausdrücklich akzeptierter Berechtigung geprüft; die gemeinsame Organisation allein genügt nicht.
- QR-Codes funktionieren nur für aktive Events im Zeitfenster von sechs Stunden vor Beginn bis zwölf Stunden nach Ende (Zeitzone Europe/Berlin).
- Regelmäßig abgelaufene Sitzungen, Sicherheitstokens, Rate-Limit-Zähler und sensible E-Mail-Payloads löschen sowie D1-Backups prüfen.

## Lokale Prüfung

`npm run build` erstellt dieselbe Worker-Ausgabe wie für den Server. `npm start` startet die gebaute Anwendung mit dem persistenten lokalen D1-Datenbestand.

Freigabestand vom 15. September 2026: Produktions-Build erfolgreich, 45/45 Smoke-Prüfungen erfolgreich, produktive npm-Abhängigkeiten ohne bekannte Audit-Funde. Die Migration `drizzle/0009_short_iceman.sql` gehört zwingend zum freigegebenen Stand.
