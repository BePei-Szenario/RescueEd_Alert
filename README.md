# RescueEd Alert

SaaS für Organisationen und Flutter-App für Android/iOS. Der produktive Serverpfad ist ein **IONOS VPS Linux XXL+ mit Ubuntu 24.04**: Caddy terminiert HTTPS, Next.js läuft nur auf Loopback, die Datenbank ist eine lokale SQLite-Datei. Die Apps verwenden dieselbe HTTPS-API unter `https://alert-rescueed.de`.

Die vollständige Installations- und Prüfanleitung steht in [SERVERBEREIT.md](SERVERBEREIT.md). Das ist eine Vorbereitung, keine Bestätigung eines bereits erfolgten Server-Rollouts.

## Entwicklung

Node.js 24 oder neuer und eine eigene, **nicht produktive** SQLite-Datei verwenden. `DATABASE_PATH` muss ein absoluter Pfad sein.

```text
npm ci
npm run db:migrate
npm run dev
```

Der Entwicklungsserver lauscht nur auf `127.0.0.1:5173`; für einen Android-Test im LAN gibt es `npm run dev:mobile-proxy`. Für produktive Builds `npm run build` und `npm start` verwenden. Server-Geheimnisse niemals in Flutter-Builds oder Git übernehmen.

Flutter-Quellcode und Testhinweise stehen in [mobile/README.md](mobile/README.md). Der B2C-Store-Status wird in [docs/B2C-STORE-SETUP.md](docs/B2C-STORE-SETUP.md) beschrieben.
