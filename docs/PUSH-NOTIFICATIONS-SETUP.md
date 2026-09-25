# Push-Alarmierung für Android und iOS

Stand: 21. September 2026. Diese Implementierung ergänzt die vorhandene Serverabfrage; sie macht RescueEd Alert nicht zu einem garantierten oder alleinigen Notruf- beziehungsweise Primäralarmweg.

## Technischer Ablauf

1. Ein Helfer checkt per QR-Code in ein aktives Event ein und erhält einen temporären, nur auf dieses Event begrenzten Zugang.
2. Die App fragt die Systemberechtigung für Benachrichtigungen ab und erhält von Firebase Cloud Messaging (FCM) ein Gerätetoken. Unter iOS vermittelt FCM die Nachricht an Apple Push Notification Service (APNs).
3. Die App überträgt Token, Plattform und ausgewählten Alarmton authentifiziert an RescueEd. Das Token wird serverseitig nur verschlüsselt gespeichert; zusätzlich liegt ein SHA-256-Wert zur eindeutigen Zuordnung vor.
4. Beim Alarm speichert der RescueEd-Server zuerst Alarm, Ziel-Einsatzmittel und Empfänger. Danach sendet er an jedes aktuell registrierte Gerät eine neutrale Push-Nachricht mit Alarm-ID und Event-ID, jedoch ohne Namen, Qualifikation, Eventbezeichnung oder Alarmtext.
5. Die App lädt die Details unmittelbar von RescueEd. Die vorhandene Fünf-Sekunden-Abfrage bleibt während des aktiven Android-Helferzugangs und in der geöffneten App als Rückfallebene aktiv.
6. Die Bestätigung wird über die bestehende authentifizierte API gespeichert. Danach beendet die App den lokalen Alarmton. Nicht mehr gültige FCM-Tokens werden serverseitig deaktiviert.
7. Beim Auschecken werden die zum Helferzugang gespeicherten Gerätetokens gelöscht.

## Serverkonfiguration auf dem IONOS-VPS

Folgende Werte gehören ausschließlich in `/etc/rescueed-alert/server.env` mit Dateimodus `0600`:

```text
FCM_SERVICE_ACCOUNT_JSON='{...vollständiges Service-Account-JSON...}'
FCM_PROJECT_ID=rescueed-alert-prod
PUSH_TOKEN_ENCRYPTION_KEY=<32 zufällige Bytes als Base64 oder 64 Hex-Zeichen>
```

Das Servicekonto benötigt nur die Berechtigung zum Senden von Firebase-Cloud-Messaging-Nachrichten. Es erhält keinen Datenbank- oder Administrationszugriff. Die JSON-Datei und der Verschlüsselungsschlüssel dürfen weder in Git noch in einen App-Build übernommen werden.
Die einfachen Anführungszeichen um das JSON sind für die systemd-`EnvironmentFile` erforderlich, damit die `\\n`-Zeichen im privaten Schlüssel erhalten bleiben.

Vor Aktivierung ist die neue SQLite-Migration anzuwenden. Danach muss ein echter Versand an mindestens ein Android-Gerät und ein physisches iPhone getestet werden.

## Flutter-Buildkonfiguration

Die Firebase-Projektwerte sind technische App-Kennungen und werden beim Build übergeben. Private Schlüssel gehören nicht in diese Parameter.

```text
--dart-define=RESCUEED_FIREBASE_PROJECT_ID=...
--dart-define=RESCUEED_FIREBASE_SENDER_ID=...
--dart-define=RESCUEED_FIREBASE_API_KEY=...
--dart-define=RESCUEED_FIREBASE_ANDROID_APP_ID=...
--dart-define=RESCUEED_FIREBASE_IOS_APP_ID=...
--dart-define=RESCUEED_FIREBASE_IOS_BUNDLE_ID=de.rescueed.alert
```

Fehlen diese Werte, bleibt Push sicher deaktiviert und die bisherige Serverabfrage funktioniert weiter.

## Google/Firebase

1. In Firebase ein Projekt und darin eine Android-App mit Paketnamen `de.rescueed.alert` anlegen.
2. Die Firebase Cloud Messaging API aktivieren.
3. Ein minimales Servicekonto für den Serverversand erstellen und dessen Schlüssel ausschließlich auf dem VPS ablegen.
4. In Google Play die Benachrichtigungsberechtigung, den Vordergrunddienst und die Datensicherheitsangaben vollständig erklären.

Für normale, vom Nutzer erlaubte Push-Benachrichtigungen ist keine gesonderte Vorabgenehmigung von Google vorgesehen. Google prüft jedoch App-Zweck, Berechtigungen, Vordergrunddienst und Store-Angaben während der Play-Prüfung. FCM darf laut Google nicht als alleinige Technik für lebenswichtige oder andere Hochrisikoanwendungen eingesetzt werden.

## Apple/APNs

Auf dem Mac sind vor dem iOS-Archiv in Xcode für das Runner-Target einzuschalten:

- Signing & Capabilities → **Push Notifications**
- Signing & Capabilities → **Background Modes** → **Remote notifications**
- Signing & Capabilities → **Time Sensitive Notifications**

Anschließend im Apple-Developer-Konto einen APNs Authentication Key erstellen und in Firebase für die iOS-App hinterlegen. Bundle-ID und Firebase-iOS-App müssen mit dem Xcode-Projekt übereinstimmen. Tests müssen auf einem physischen iPhone stattfinden.

Normale und zeitkritische Hinweise benötigen keine individuelle Apple-Sondergenehmigung, bleiben aber von der Einwilligung und den Fokus-Einstellungen des Nutzers abhängig. Nur **Critical Alerts**, die Lautlosmodus und „Nicht stören“ übergehen, benötigen ein von Apple ausdrücklich genehmigtes Critical-Alerts-Entitlement. RescueEd Alert fordert dieses Entitlement derzeit nicht an und setzt `time-sensitive` ein.

## Erforderliche Anpassungen der Rechtstexte

Diese Punkte müssen vor Veröffentlichung durch die anwaltliche Prüfung in den jeweils passenden Text übernommen werden:

### Datenschutzerklärung

- Firebase Cloud Messaging und unter iOS zusätzlich APNs als Empfänger beziehungsweise technische Dienstleister nennen.
- Verarbeitete Daten aufführen: pseudonymes Push-Token, Token-Hash, Plattform, ausgewählter Alarmton, Zeitpunkt der Registrierung und Zustellung, technische Alarm-ID und Event-ID, Zustellfehler.
- Klarstellen, dass keine Namen, Qualifikationen, Eventbezeichnungen, Alarmtexte oder Gesundheitsdaten in der Push-Nachricht an Google oder Apple übermittelt werden.
- Zweck: Zustellung und technische Absicherung von Alarmhinweisen; Rechtsgrundlage und Rollenaufteilung anwaltlich festlegen.
- Drittlandtransfers, Garantien, Verträge und aktuelle Anbieteranschriften von Google/Firebase und Apple anhand der tatsächlich abgeschlossenen Kontoverträge eintragen.
- Löschung beschreiben: bei Auschecken beziehungsweise spätestens mit der automatischen Helferdatenlöschung 30 Tage nach dem tatsächlichen Eventende; sofortige Deaktivierung technisch ungültiger Tokens; Backuplaufzeiten berücksichtigen.
- Auf Widerruf der Systemberechtigung in Android/iOS und die weiterhin bestehende organisatorische Rückfallebene hinweisen.

### AVV und Unterauftragnehmerliste

- Google/Firebase als Unterauftragnehmer für Push-Vermittlung aufnehmen, soweit Google nach dem konkret abgeschlossenen Firebase-Vertrag als Auftragsverarbeiter eingesetzt wird.
- Apple/APNs und die jeweilige datenschutzrechtliche Rolle anhand der Apple-Vertragsunterlagen bewerten und dokumentieren.
- Datenarten, Zweck, Löschung, Verschlüsselung der Tokens und Drittlandtransfer aufnehmen.

### AGB B2B und B2C

- Push als ergänzenden Alarmkanal beschreiben, nicht als garantierten alleinigen Notruf- oder Primäralarmweg.
- Voraussetzungen nennen: Internet, aktives Gerät, Betriebssystemberechtigungen, Firebase/APNs-Erreichbarkeit und nicht erzwungen beendete App.
- Pflicht des Nutzers beziehungsweise der Organisation zu einem unabhängigen Rückfallweg und zur Kontrolle fehlender Bestätigungen aufnehmen.
- Unterschiede erklären: Android kann während eines aktiven Zugangs zusätzlich den Vordergrunddienst verwenden; iOS verwendet APNs und zeitkritische Hinweise.

### SLA

- Messpunkt der zentralen RescueEd-API von einer tatsächlichen Endgeräteanzeige trennen.
- Keine garantierte Zustellzeit oder Wahrnehmung für FCM/APNs zusagen.
- Ausfälle und Drosselungen externer Push-Dienste transparent behandeln, ohne zwingende gesetzliche Verantwortlichkeit pauschal auszuschließen.
- Alarmannahme, Serverversandversuch und Nutzerbestätigung als getrennte protokollierte Ereignisse definieren.

## Freigabetest

- Android: App Vordergrund, Hintergrund, Displaysperre, Doze-Modus, Neustart und manuell erzwungenes Beenden testen.
- iOS: Vordergrund, Hintergrund, Displaysperre, Fokusmodus, deaktivierte Zeitkritisch-Berechtigung und manuelles Entfernen aus dem App-Umschalter testen.
- Für beide Systeme prüfen: neutraler Sperrbildschirmtext, richtiger Ton, kein Doppelalarm, Bestätigung beendet lokalen Ton, Auschecken entfernt Token und abgelaufener Eventzugang erhält keine neuen Alarme.
- Protokollieren, welche Fälle betriebssystembedingt nicht garantiert werden können.

Offizielle technische Grundlagen: [Firebase für Flutter](https://firebase.google.com/docs/cloud-messaging/flutter/get-started), [FCM-Nachrichtenpriorität](https://firebase.google.com/docs/cloud-messaging/android-message-priority), [Apple Critical Alerts](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts).
