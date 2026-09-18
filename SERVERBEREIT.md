# RescueEd Alert – IONOS VPS Linux XXL+ / Ubuntu 24.04

Zielarchitektur: Caddy (HTTPS) → Next.js auf `127.0.0.1:3000` → lokale SQLite-Datenbank unter `/var/lib/rescueed-alert`. Die Flutter-Apps sprechen ausschließlich `https://alert-rescueed.de` an. Für diesen Serverpfad wird **kein Cloudflare Worker und kein D1-Binding** benötigt. Node.js **24 oder neuer** ist wegen `node:sqlite` erforderlich.

Der lokale Build und die SQLite-Migrationen sind geprüft. Dies ist **noch keine Go-live-Freigabe**: Server, DNS, SMTP, Store-Produkte, iOS/Android-Release-Signierung, Push-Zustellung, Datenübernahme und Restore-Test müssen real eingerichtet und getestet werden.

## Bereitstellung auf Ubuntu 24.04

1. System aktualisieren; Node.js 24, Caddy und `msmtp` aus vertrauenswürdigen Paketquellen installieren. Einen eigenen Systemnutzer `rescueed-alert` ohne interaktive Anmeldung anlegen. Den Quellcode nach `/opt/rescueed-alert/current` ausrollen. Der Dienstnutzer benötigt Leserechte dort und Schreibrechte **nur** in `/var/lib/rescueed-alert`.
2. Die Vorlagen in `deploy/ionos/` verwenden. `/etc/rescueed-alert/server.env` und `/etc/rescueed-alert/msmtprc` müssen dem Dienstnutzer gehören und Modus `0600` haben. Die Datenbank und ihr Verzeichnis dürfen nicht öffentlich lesbar sein. Geheimnisse mit einer sicheren Zufallsquelle erzeugen; keine Passwörter oder Schlüssel in Git, Chat oder Client-Builds kopieren.
3. `npm ci`, `npm run build`, dann mit geladener Server-Umgebung `npm run db:migrate` und `npm run preflight:vps` ausführen. Migrationen sind nummeriert, transaktional und werden gegen Änderungen bereits angewendeter SQL-Dateien geprüft. Vor jeder späteren Migration ein separates Datenbank-Backup anlegen.
4. Das Betreiberkonto **einmalig** mit `npm run db:bootstrap-owner` anlegen. Dafür `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_NAME` und `BOOTSTRAP_OWNER_PASSWORD_FILE` setzen. Die Passwortdatei muss Modus `0600` haben und mindestens 16 Zeichen enthalten; anschließend sicher entfernen. Das Konto wird als geschützt angelegt. Es gibt kein fest kodiertes Standardpasswort.
5. Caddy-Konfiguration und die systemd-Dienste sowie Mail- und Wartungs-Timer aus `deploy/ionos/` installieren. Domain per A/AAAA auf den VPS zeigen lassen; Caddy holt und erneuert TLS-Zertifikate. IONOS-Firewall: öffentlich nur 80/443; SSH/22 nur von administrativen IP-Adressen. Next.js darf nur an Loopback gebunden sein. Caddy überschreibt `X-Real-IP`; Clients dürfen keine eigenen Proxy-IP-Header durchreichen.
6. `https://alert-rescueed.de/api/health` und die geschützten Abläufe testen. Nach einem frischen Datenbankstart ist `/api/register/legal` absichtlich **503**, bis die rechtlich freigegebenen AGB, Datenschutz, AVV und SLA im Unternehmerbereich veröffentlicht sind. Keine mitgelieferten Entwürfe ungeprüft veröffentlichen.

## E-Mail-Versand

Die Anwendung legt E-Mails in `email_outbox` ab. `rescueed-alert-mail.timer` übergibt sie jede Minute per `msmtp` an einen authentifizierten SMTP-Server. `deploy/ionos/msmtprc.example` ist die Vorlage für zwei Konten mit Namen `mfa` und `kontakt`; ihre Absender müssen exakt den Variablen `MAIL_FROM_MFA` und `MAIL_FROM_CONTACT` entsprechen. Vorgesehen sind `noreply_ra@rescueed.de` und `info_ra@rescueed.de`. TLS mit Zertifikatsprüfung und SMTP-Submission über Port 587 verwenden. Port 25 wird nicht benötigt. Fehlgeschlagene Aufträge werden nicht blind erneut gesendet. Nach SMTP-Übergabe werden sensible Inhalte aus der Outbox entfernt. Eine SMTP-Annahme ist noch kein Zustellnachweis – Postfach, SPF, DKIM und DMARC end-to-end prüfen.

## Datenübernahme und Backups

Die bisherige lokale Miniflare/D1-Datenbank enthält Nutzdaten und darf **nicht** durch die neue leere SQLite-Datei ersetzt werden. Vor der Produktivschaltung den tatsächlichen Datenbestand inventarisieren, einen konsistenten Export erstellen, auf einer Kopie migrieren und Konto-, Event-, Rechnungs- und Rechtstextzahlen abgleichen. Keine Skripte direkt auf der einzigen Kopie ausführen. Der lokale Altbestand ist nicht automatisch übernommen. D1-SQL-Exporte und Miniflare-SQLite-Dateien sind unterschiedliche Eingabeformen; der Importpfad wird am konkreten Export getestet.

IONOS Cloud Backup aktivieren, EU als Backup-Standort wählen und Kapazität nach **belegten Daten plus Aufbewahrung** statt nach Serverplatten-Größe dimensionieren. Für SQLite mit WAL nicht bloß eine laufende `.sqlite`-Datei kopieren: konsistente SQLite-Backups oder ein datenbankbewusstes Backup verwenden. Verschlüsselung, regelmäßige Sicherungen, Alarme bei Fehlschlägen und einen dokumentierten Restore-Test einrichten.

## Mobile Apps

Android und iOS verwenden standardmäßig `https://alert-rescueed.de`; der Release-Build muss diese HTTPS-Adresse behalten. Android-HTTP ist nur im Debug-Manifest erlaubt. Android-Release wird nicht mehr mit einem Debug-Schlüssel signiert; vor Store-Upload den eigenen Upload-Key lokal unter `mobile/android/key.properties` eintragen. iOS wird auf dem Mac mit dem eigenen Apple-Team signiert. Die Store-Produkt-IDs und Server-Secrets stehen in `docs/B2C-STORE-SETUP.md`.

**Alarmgrenze:** Der Android-Foreground-Service pollt während eines aktiven Helferzugangs. Für zuverlässig zugestellte Alarme bei beendeter App beziehungsweise iOS-Hintergrundbetrieb sind FCM/APNs und echte Gerätetests noch erforderlich. Ein VPS mit 99,99-%-Infrastrukturverfügbarkeit garantiert weder Push-Zustellung noch Alarmwahrnehmung; ein unabhängiger Rückfall-Kommunikationsweg bleibt nötig.

## Support und App-Diagnose

Migration `0016` legt Support-Tickets, Nachrichten und App-Crashberichte an. Angemeldete Kunden und aktive Helfer können Tickets über die App eröffnen; angemeldete SaaS-Kunden erreichen `/support`. Im Unternehmerbereich erscheinen sie unter **Support & Fehler** mit Antwort und Status. Helfer können Antworten nur solange ihr temporärer Eventzugang aktiv ist lesen. Es gibt noch keine E-Mail-Benachrichtigung bei neuen Antworten.

Release-Apps melden unbehandelte Flutter-/Plattformfehler an `/api/mobile/crash-reports`. Gesendet werden Plattform, App-Version, Fehlerklasse und gekürzte Stackframes – keine Fehlermeldung, Konto-ID, Sitzungs-Cookies oder Gerät-ID. Der Server begrenzt die Annahme und bereinigt typische sensible Muster. Der tägliche `rescueed-alert-maintenance.timer` entfernt Crashberichte nach 30 Tagen; seinen Lauf und Fehler regelmäßig überwachen. Ein Absturz ohne Netzwerk oder ein Prozessabbruch vor Abschluss des HTTP-Aufrufs kann nicht gemeldet werden. Vor App-Veröffentlichung die Datenschutzerklärung um Zweck, Rechtsgrundlage, Datenarten, IP-basierte Missbrauchsbegrenzung und Aufbewahrung ergänzen und die Aufbewahrungsfrist für Support-Tickets festlegen. Support-Tickets eines selbst gelöschten Kundenkontos werden mit ihren Nachrichten entfernt.

## Produktions-Check

- `npm run build` und `npx tsc --noEmit` fehlerfrei
- `npm run db:migrate` auf einer Kopie, danach `/api/health` HTTP 200
- Betreiberlogin inklusive E-Mail-Sicherheitscode; Registrierung und Passwortlink im echten Postfach
- Event buchen, QR Kommen/Gehen, Alarm/Bestätigung, Mail mit Abschluss-PDF
- CSV-Export, Löscharchiv, Monatsbuchung und Datenschutzrechte prüfen
- B2C: Google-/Apple-Testkauf, Abo-Ablauf und Store-Ausfall testen
- Android Standby und iOS Hintergrund/geschlossene App separat prüfen
- Ticket aus App und SaaS erstellen, Betreiberantwort und Zugriffstrennung prüfen; Release-Crashbericht auf echten Geräten testen
- verschlüsseltes Backup und erfolgreiche Wiederherstellung nachweisen
