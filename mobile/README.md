# RescueEd Alert Mobile

Gemeinsame Flutter-App für Android und iOS. Die App verwendet ausschließlich die RescueEd-Alert-API; es gibt keine zweite lokale Fachdatenbank.

## Enthaltene Abläufe

- Organisationslogin mit Passwort und Sicherheitscode
- Eventliste und Eventdashboard für Organisationen
- Helfer anlegen, einteilen und ausbuchen
- Sanitätsmittel anlegen, löschen, alarmieren und wieder freimelden
- QR-Scan für Kommen und Gehen
- temporärer Helferzugang im Android Keystore beziehungsweise iOS Keychain
- Alarmabruf bezogen auf das zugeteilte Sanitätsmittel
- sicht- und hörbare lokale Alarmmeldung, Vibration und Bestätigung
- vollständige Entfernung des temporären Zugangs nach erfolgreichem Auschecken
- separates Privatkonto mit versionierten Rechtstexten und E-Mail-Sicherheitscode
- privates Monatsabo über Google Play / App Store; neue Events nur nach serverseitig bestätigtem Abo
- Support-Tickets für angemeldete Konten und aktive Helferzugänge unter Einstellungen
- reduzierte Crashberichte in Release-Builds an die SaaS (ohne Fehlermeldung oder Authentifizierungsdaten)

Die Einrichtung der Store-Produkte und Server-Bindings steht in [docs/B2C-STORE-SETUP.md](../docs/B2C-STORE-SETUP.md). Ohne Store-Produkte ist der Kaufpfad gesperrt.

## Android lokal testen

Für den lokalen Test muss die native Next.js-SaaS auf dem Entwicklungsrechner unter Port 5173 laufen. `DATABASE_PATH` muss dabei auf eine migrierte lokale SQLite-Datei zeigen. Der Android-Emulator erreicht den Rechner über `10.0.2.2`:

```powershell
flutter run --dart-define=RESCUEED_API_URL=http://10.0.2.2:5173
```

Die bereits erzeugte Debug-APK liegt unter `build/app/outputs/flutter-apk/app-debug.apk`. Sie enthält dieselbe lokale Emulator-Adresse.

Für ein echtes Android-Gerät muss statt `10.0.2.2` eine vom Gerät erreichbare HTTPS-Adresse oder vorübergehend die LAN-Adresse des Entwicklungsrechners verwendet werden.

Bei einem per WLAN-ADB verbundenen Gerät kann die App ohne offenen LAN-Port über einen Reverse-Tunnel getestet werden:

```powershell
adb reverse tcp:5173 tcp:5173
flutter run -d <GERAETE-ID> --dart-define=RESCUEED_API_URL=http://127.0.0.1:5173
```

## Produktionsbuild Android

```powershell
flutter build appbundle --release --dart-define=RESCUEED_API_URL=https://alert-rescueed.de
```

Vor Veröffentlichung muss `android/key.properties` mit dem eigenen, sicher verwahrten Upload-Key konfiguriert werden. Ohne diese Datei wird ein Release **nicht** mit dem Debug-Schlüssel signiert. Weder `key.properties` noch Keystore-Dateien gehören in Git.

Der Produktionsendpunkt ist die HTTPS-Adresse `https://alert-rescueed.de` am IONOS-VPS. Keine direkte Server-IP und kein HTTP in einem Release-Build verwenden. DNS und TLS müssen vor dem End-to-End-Test aktiv sein.

## iOS auf dem Mac

```bash
flutter pub get
flutter build ipa --release \
  --dart-define=RESCUEED_API_URL=https://alert-rescueed.de
```

Der Apple-Produktcode `de.rescueed.alert.monthly` ist als sicherer iOS-Standard hinterlegt und kann bei Bedarf weiterhin per `APPLE_SUBSCRIPTION_ID` überschrieben werden. Anschließend in Xcode das Apple-Developer-Team für das Bundle `de.rescueed.alert` auswählen und archivieren. Die Release-Konfiguration verwendet das App-Store-Profil `RescueEd Alert App Store` sowie Produktionsberechtigungen für Apple-Push; dafür wird kein registriertes Testgerät benötigt. Kamera- und Benachrichtigungsberechtigungen sind bereits beschrieben.

## Push-Betrieb

Die Testversion fragt Alarmierungen im geöffneten Helferbildschirm alle fünf Sekunden verschlüsselt bei der SaaS ab und erzeugt eine lokale Alarmbenachrichtigung. Für zuverlässige Alarmierung bei vollständig beendeter App werden vor dem Store-Betrieb zusätzlich Firebase Cloud Messaging für Android, APNs für iOS sowie die zugehörigen Server-Zugangsdaten benötigt. Diese Zugangsdaten gehören ausschließlich in die Server-/Store-Konfiguration und niemals in dieses Repository.
