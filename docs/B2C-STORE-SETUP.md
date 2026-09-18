# RescueEd Alert: private App-Abonnements

Stand: 17.09.2026. Die Organisations-SaaS und ihre Event-Einzelbuchungen bleiben unverändert. Privatkonten werden ausschließlich in der App registriert und angemeldet. Das Monatsabo wird über Google Play beziehungsweise den Apple App Store verkauft. Ein Privatkonto bekommt weder eine Kostenfreigabe noch eine Dauernutzer-Freigabe aus der Unternehmerplattform.

## Vor dem ersten B2C-Test

1. Auf dem VPS alle SQLite-Migrationen mit `DATABASE_PATH=/var/lib/rescueed-alert/rescueed.sqlite npm run db:migrate` anwenden und in Staging verifizieren.
2. In Google Play Console die Android-App mit Paketname `de.rescueed.alert` und ein automatisch verlängerndes Monatsabo anlegen. In App Store Connect eine iOS-App mit der dort tatsächlich verwendeten Bundle-ID und ebenfalls ein automatisch verlängerndes Monatsabo anlegen. Beide Produkte mit **39,00 € pro Monat** für Deutschland konfigurieren; lokalisierte Store-Preise sind im Store festzulegen. Produkt-IDs müssen eindeutig und endgültig gewählt werden.
3. Der App-Build braucht `RESCUEED_API_URL`, `GOOGLE_SUBSCRIPTION_ID` und `APPLE_SUBSCRIPTION_ID` als `--dart-define`. Die IDs müssen exakt mit den Server-Produkt-IDs übereinstimmen. Es gehören keine Store-Schlüssel in die App.
4. Serverseitig in `/etc/rescueed-alert/server.env` (Modus 0600) setzen: `APP_SUBSCRIPTION_KEY` (32 zufällige Byte, Base64), `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (Service Account mit Android-Publisher-Berechtigung), `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`. Als Konfigurationswerte setzen: `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_PRODUCT_ID`, `APPLE_BUNDLE_ID`, `APPLE_PRODUCT_ID`. `APPLE_ALLOW_SANDBOX=true` ausschließlich in isolierter Staging-Umgebung; Produktion lässt diesen Wert weg. Schlüssel nicht in Git, Chat oder Client-Build ablegen.
5. In der Unternehmerplattform eigene B2C-AGB (`agb_b2c`), Datenschutztext und Widerrufsbelehrung nach rechtlicher Prüfung als **veröffentlicht** speichern. Entwürfe schalten die Registrierung nicht frei. Die Datenschutzfassung muss auch Store-Verarbeitung und B2C-Konten abdecken. Die AGB für Organisationen (`agb`) werden B2C nicht angezeigt.
6. Store-Testkäufe für Android und iOS mit echten Testkonten durchführen: Registrierung, rechtliche Bestätigungen, Sicherheitscode, Login, Kauf, Wiederherstellung, Ablauf/Kündigung, neues Event bei aktivem Abo, Sperre neuer Events nach Ablauf, Nutzung bereits gestarteter Events und Kontolöschung prüfen.

## Sicherheits- und Betriebsverhalten

- Der Server vertraut weder einem Client-Flag noch einem bloßen Kaufbeleg. Er fragt Google Play bzw. Apple direkt ab, prüft Produkt und Zuordnung zur internen Nutzer-ID und speichert die Kaufreferenz AES-GCM-verschlüsselt. Beim Anlegen **jedes** neuen Events erfolgt eine erneute Store-Prüfung. Ist der Store nicht erreichbar, wird kein neues Event freigeschaltet.
- Das Store-Produkt zeigt den tatsächlich verlangten Preis. Der Server akzeptiert nur die konfigurierte Produkt-ID. Preisänderungen dürfen nicht allein in der App erfolgen.
- Nach Abo-Ablauf bleiben bestehende Events und deren Helfer-/Alarmfunktionen erreichbar. Nur `POST /api/events` wird blockiert. Kontolöschung ist etwas anderes: Sie beendet den Zugang zum gesamten Konto.
- Die Kontolöschung beendet **nicht** das Store-Abo. Die App weist vor Löschung auf die gesonderte Kündigung im jeweiligen Store hin. Für Produktivbetrieb sind Store-Kündigungs- und Erstattungswege sowie die rechtliche Widerrufsfunktion abschließend festzulegen.
- Die Unternehmerplattform zeigt bei Privatkonten nur den **zuletzt bekannten** Abo-Status mit Prüfzeit an. Sie ersetzt keine Live-Store-Abfrage.

## Noch keine Freigabe für den Store-Launch

Die Store-Apps, Produkt-IDs und Zugangsdaten liegen derzeit noch nicht vor. Daher konnte kein echter Kauf oder Store-Callback getestet werden. Rechtstexte sind nur Entwürfe. Außerdem muss die Hintergrund-Push-Zustellung für kritische Alarmierungen gesondert mit FCM/APNs produktiv getestet werden; Polling in einer geöffneten App ist kein gleichwertiger Ersatz.
