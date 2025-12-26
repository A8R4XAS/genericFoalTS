# TypeORM Datenbank-Konfiguration

## Übersicht

Die TypeORM DataSource-Konfiguration unterstützt verschiedene Umgebungen (development, test, production) mit individuellen Einstellungen für Logging, Connection Pooling und Schema-Management.

## Konfigurationsdateien

Die Datenbank-Konfiguration befindet sich in den folgenden Dateien:

- `config/default.json` - Basis-Konfiguration (SQLite für lokale Entwicklung)
- `config/development.json` - Entwicklungsumgebung (PostgreSQL)
- `config/test.json` - Testumgebung (SQLite)
- `config/e2e.json` - End-to-End-Tests (SQLite)
- `config/production.json` - Produktionsumgebung

## Umgebungsvariablen

Die Datenbankverbindung kann über `.env` Datei konfiguriert werden:

```env
NODE_ENV=development
DATABASE_TYPE=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=genericfoalts
```

## Connection Pooling

### Development
- **Max Connections**: 10
- **Min Connections**: 2
- **Idle Timeout**: 30000ms (30 Sekunden)
- **Connection Timeout**: 2000ms (2 Sekunden)
- **Max Lifetime**: 600000ms (10 Minuten)

### Test / E2E
- **Max Connections**: 5
- **Min Connections**: 1
- **Idle Timeout**: 10000ms (10 Sekunden)
- **Connection Timeout**: 2000ms (2 Sekunden)

### Production
- **Max Connections**: 20
- **Min Connections**: 5
- **Idle Timeout**: 60000ms (60 Sekunden)
- **Connection Timeout**: 5000ms (5 Sekunden)
- **Max Lifetime**: 1800000ms (30 Minuten)

## Logging-Level

Die Logging-Konfiguration passt sich automatisch an die Umgebung an:

### Development
```typescript
['query', 'error', 'warn', 'migration', 'schema']
```
Zeigt SQL-Queries, Fehler, Warnungen, Migrations und Schema-Änderungen.

### Test
```typescript
['error']
```
Zeigt nur Fehler, um die Test-Ausgabe übersichtlich zu halten.

### Production
```typescript
['error', 'warn']
```
Zeigt nur Fehler und Warnungen für Performance-Optimierung.

## Synchronize-Option

- **Development**: `true` - Automatische Schema-Synchronisation
- **Test/E2E**: `true` - Automatische Schema-Synchronisation für Tests
- **Production**: `false` - Schema-Änderungen nur über Migrations

⚠️ **Wichtig**: In Produktion sollte `synchronize` immer `false` sein, um Datenverlust zu vermeiden!

## SSL-Konfiguration

Für Produktionsumgebungen kann SSL aktiviert werden:

```json
{
  "database": {
    "ssl": true,
    "ssl.rejectUnauthorized": false
  }
}
```

## Cache-Konfiguration

Optional kann Query-Caching aktiviert werden:

```json
{
  "database": {
    "cache": {
      "enabled": true,
      "duration": 60000
    }
  }
}
```

## Migrations

### Migration erstellen
```bash
npm run makemigrations
```

### Migrations ausführen
```bash
npm run migrations
```

### Migration rückgängig machen
```bash
npm run revertmigration
```

## Datenbank-Skripte

### Datenbank starten (Docker)
```bash
npm run db:start
```

### Datenbank stoppen
```bash
npm run db:stop
```

### Datenbank neu starten
```bash
npm run db:restart
```

### Datenbank-Status prüfen
```bash
npm run db:status
```

### Datenbank-Logs anzeigen
```bash
npm run db:logs
```

### Backend mit Datenbank starten
```bash
npm run backendDev
```

## Testen der Verbindung

Um die Datenbankverbindung zu testen:

```bash
npm run build
npm start
```

Die Anwendung sollte erfolgreich starten und eine Verbindung zur Datenbank herstellen.

## Fehlerbehebung

### Verbindungsfehler
- Prüfen Sie, ob PostgreSQL läuft: `npm run db:status`
- Überprüfen Sie die Credentials in `.env`
- Stellen Sie sicher, dass die Datenbank existiert

### Migration-Fehler
- Bauen Sie das Projekt neu: `npm run build`
- Prüfen Sie die Migration-Dateien in `src/migrations/`
- Stellen Sie sicher, dass die Datenbank erreichbar ist

### Pool-Fehler
- Reduzieren Sie `max` Connections in der Config
- Erhöhen Sie `connectionTimeout` für langsame Verbindungen
- Prüfen Sie die Netzwerkverbindung zur Datenbank
