# GenericFoalTS

Ein generisches Backend-Projekt basierend auf [FoalTS](https://foalts.org/) - einem eleganten und umfassenden Node.js-Framework für den Aufbau von Web-Anwendungen.

## 📋 Inhaltsverzeichnis

- [GenericFoalTS](#genericfoalts)
  - [📋 Inhaltsverzeichnis](#-inhaltsverzeichnis)
  - [✨ Features](#-features)
  - [🛠 Technologie-Stack](#-technologie-stack)
  - [📦 Voraussetzungen](#-voraussetzungen)
  - [🚀 Installation](#-installation)
  - [⚙️ Konfiguration](#️-konfiguration)
  - [💻 Entwicklung](#-entwicklung)
    - [Development-Server starten](#development-server-starten)
    - [Hot Reload](#hot-reload)
  - [🎨 Code-Qualität](#-code-qualität)
    - [Linting](#linting)
    - [Formatierung](#formatierung)
    - [Pre-commit Hooks](#pre-commit-hooks)
    - [VS Code Integration](#vs-code-integration)
  - [🧪 Testing](#-testing)
    - [Unit-Tests](#unit-tests)
    - [End-to-End Tests](#end-to-end-tests)
  - [🗄️ Datenbank-Management](#️-datenbank-management)
    - [Migrationen](#migrationen)
    - [Benutzer erstellen](#benutzer-erstellen)
  - [📦 Build \& Deployment](#-build--deployment)
    - [Production Build](#production-build)
    - [Production starten](#production-starten)
  - [📁 Projektstruktur](#-projektstruktur)
  - [📝 Verfügbare Scripts](#-verfügbare-scripts)
  - [📄 Lizenz](#-lizenz)

## ✨ Features

- **TypeScript** - Vollständig typsicher entwickelt
- **FoalTS Framework** - Moderne Architektur mit Dependency Injection
- **TypeORM** - Leistungsstarkes ORM mit Migrations-Support
- **PostgreSQL** - Robuste relationale Datenbank
- **Multi-Environment** - Separate Konfigurationen für Development, Test und Production
- **Testing** - Unit-Tests und E2E-Tests vorkonfiguriert
- **Hot Reload** - Automatisches Neuladen während der Entwicklung
- **Linting** - ESLint-Integration für Code-Qualität
- **Prettier** - Automatische Code-Formatierung
- **Pre-commit Hooks** - Automatische Qualitätsprüfung vor jedem Commit

## 🛠 Technologie-Stack

- **Runtime**: Node.js >= 22.0.0
- **Sprache**: TypeScript 5.5.4
- **Framework**: FoalTS 5.0.0
- **Datenbank**: PostgreSQL
- **ORM**: TypeORM 0.3.27
- **Testing**: Mocha, SuperTest
- **Code-Qualität**: ESLint, Prettier
- **Git Hooks**: Husky, lint-staged

## 📦 Voraussetzungen

- **Node.js** >= 22.0.0
- **PostgreSQL** (für Development und Production)
- **npm** oder **yarn**

## 🚀 Installation

1. **Repository klonen**
   ```bash
   git clone <repository-url>
   cd genericFoalTS
   ```

2. **Dependencies installieren**
   ```bash
   npm install
   ```

3. **Umgebungsvariablen konfigurieren**
   
   Erstelle eine `.env` Datei im Projektverzeichnis:
   ```env
   NODE_ENV=development
   DATABASE_TYPE=postgres
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_USERNAME=postgres
   DATABASE_PASSWORD=postgres
   DATABASE_NAME=genericfoalts
   ```

4. **Datenbank erstellen**
   ```bash
   # PostgreSQL-Datenbank erstellen
   createdb genericfoalts
   ```

5. **Datenbank-Migrationen ausführen**
   ```bash
   npm run build
   npm run migrations
   ```

## ⚙️ Konfiguration

Die Anwendung nutzt verschiedene Konfigurationsdateien im `config/` Verzeichnis:

- `default.json` - Basis-Konfiguration
- `development.json` - Development-Umgebung (PostgreSQL)
- `test.json` - Test-Umgebung (SQLite)
- `e2e.json` - End-to-End-Tests (SQLite)
- `production.json` - Production-Umgebung

Weitere Details zur Datenbank-Konfiguration findest du in [DATABASE_CONFIG.md](DATABASE_CONFIG.md).

### Rate Limiting

Rate Limiting ist über `config/default.json` konfigurierbar:

- `rateLimit.default` – Limits für normale API-Endpunkte
- `rateLimit.auth` – Limits für Auth-Endpunkte
- `rateLimit.endpoints.<Controller>.<Methode>` – Endpoint-spezifische Overrides

Bei Überschreitung wird `429 Too Many Requests` zurückgegeben. Zusätzlich werden
`RateLimit-*` und `X-RateLimit-*` Header in Responses gesetzt.

## 💻 Entwicklung

### Development-Server starten

```bash
# Mit automatischem Datenbank-Start
npm run backendDev

# Oder manuell
npm run db:start
npm run dev
```

Die Anwendung läuft standardmäßig auf `http://localhost:3001`.

### Hot Reload

Der Development-Server beobachtet automatisch Änderungen an TypeScript-Dateien und kompiliert/startet die Anwendung neu.

## 🎨 Code-Qualität

Dieses Projekt verwendet ESLint und Prettier für konsistente Code-Qualität und -Formatierung.

### Linting

```bash
# Code auf Fehler prüfen
npm run lint

# Code-Probleme automatisch beheben
npm run lint:fix
```

### Formatierung

```bash
# Code formatieren
npm run format

# Formatierung prüfen (ohne Änderungen)
npm run format:check
```

### Pre-commit Hooks

Husky führt automatisch vor jedem Commit folgende Aktionen aus:
- ESLint prüft und behebt Fehler in geänderten TypeScript-Dateien
- Prettier formatiert geänderte Dateien

Commits mit Linting-Fehlern werden automatisch verhindert.

### VS Code Integration

Das Projekt enthält empfohlene VS Code-Einstellungen (`.vscode/settings.json`):
- Automatisches Formatieren beim Speichern
- ESLint-Integration mit automatischer Fehlerkorrektur
- Empfohlene Extensions (ESLint, Prettier)

Installiere die empfohlenen Extensions für die beste Entwicklungserfahrung.

## 🧪 Testing

### Unit-Tests

```bash
# Tests einmalig ausführen
npm run build:test
npm run start:test

# Tests im Watch-Mode
npm run test
```

### End-to-End Tests

```bash
# E2E-Tests einmalig ausführen
npm run build:e2e
npm run start:e2e

# E2E-Tests im Watch-Mode
npm run e2e
```

## 🗄️ Datenbank-Management

PostgreSQL wird über npm-Scripts verwaltet:

```bash
npm run db:start    # PostgreSQL starten
npm run db:stop     # PostgreSQL stoppen
npm run db:restart  # PostgreSQL neu starten
npm run db:status   # Status anzeigen
npm run db:logs     # Log-Verzeichnis öffnen
```

### Migrationen

```bash
# Neue Migration erstellen
npm run makemigrations

# Migrationen ausführen
npm run migrations

# Letzte Migration rückgängig machen
npm run revertmigration
```

### Benutzer erstellen

```bash
npm run build
node build/scripts/create-user.js
```

## 📦 Build & Deployment

### Production Build

```bash
npm run build
```

### Production starten

```bash
npm start
```

Die kompilierten Dateien befinden sich im `build/` Verzeichnis.

## 📁 Projektstruktur

```
genericFoalTS/
├── build/                  # Kompilierte JavaScript-Dateien
├── config/                 # Umgebungs-Konfigurationen
│   ├── default.json
│   ├── development.json
│   ├── test.json
│   ├── e2e.json
│   └── production.json
├── public/                 # Statische Dateien
├── scripts/                # Utility-Scripts
│   └── db-control.js      # Datenbank-Management
├── src/                    # TypeScript-Quellcode
│   ├── app/
│   │   ├── controllers/   # HTTP-Controller
│   │   ├── entities/      # TypeORM-Entities
│   │   ├── hooks/         # FoalTS-Hooks
│   │   └── services/      # Business-Logic-Services
│   ├── middlewares/       # Custom Middleware (Best Practice)
│   ├── utils/             # Helper-Funktionen
│   ├── validators/        # Input-Validierungen
│   ├── types/             # TypeScript-Typen
│   ├── e2e/               # End-to-End-Tests
│   ├── scripts/           # TypeScript-Scripts
│   ├── db.ts              # TypeORM DataSource
│   ├── index.ts           # Application-Entry-Point
│   ├── e2e.ts             # E2E-Test-Setup
│   └── test.ts            # Unit-Test-Setup
├── tsconfig.*.json        # TypeScript-Konfigurationen
└── package.json
```

## 📝 Verfügbare Scripts

| Script | Beschreibung |
|--------|--------------|
| `npm run build` | Projekt für Production kompilieren |
| `npm start` | Production-Server starten |
| `npm run dev` | Development-Server mit Hot-Reload |
| `npm run backendDev` | DB starten + Development-Server |
| `npm run test` | Unit-Tests im Watch-Mode |
| `npm run e2e` | E2E-Tests im Watch-Mode |
| `npm run lint` | Code mit ESLint prüfen |
| `npm run lint:fix` | Code-Probleme automatisch beheben |
| `npm run format` | Code mit Prettier formatieren |
| `npm run format:check` | Formatierung prüfen |
| `npm run makemigrations` | Neue Datenbank-Migration erstellen |
| `npm run migrations` | Migrationen ausführen |
| `npm run revertmigration` | Letzte Migration zurückrollen |
| `npm run db:start` | PostgreSQL starten |
| `npm run db:stop` | PostgreSQL stoppen |
| `npm run db:restart` | PostgreSQL neu starten |
| `npm run db:status` | PostgreSQL-Status anzeigen |

## 📄 Lizenz

MIT

---

**Entwickelt mit [FoalTS](https://foalts.org/)**