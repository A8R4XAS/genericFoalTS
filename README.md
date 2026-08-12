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
    - [Rate Limiting](#rate-limiting)
    - [Security Headers](#security-headers)
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

Rate Limiting schützt die API, indem es begrenzt, wie viele Anfragen ein einzelner Client
pro Zeitfenster stellen darf. Wird das Limit überschritten, antwortet der Server mit
`429 Too Many Requests` und einem `Retry-After`-Header.

Es gibt zwei vordefinierte Profile:

| Profil    | Verwendung                              | Standard            |
| --------- | --------------------------------------- | ------------------- |
| `default` | Normale API-Endpunkte (`ApiController`) | 120 Anfragen / 60 s |
| `auth`    | Auth-Endpunkte (`AuthController`)       | 60 Anfragen / 60 s  |

Einzelne Endpunkte können über `rateLimit.endpoints` in `config/default.json` mit
eigenen, schärferen Limits versehen werden – z. B. `AuthController.login: 15/60s`.

Alle Responses enthalten `RateLimit-*`- und `X-RateLimit-*`-Header mit dem aktuellen
Zählerstand.

> **Hinweis:** Die aktuelle Implementierung nutzt einen In-Memory-Store. Für verteilte
> Deployments (mehrere Server-Instanzen) sollte ein gemeinsamer Store wie **Redis**
> verwendet werden.

Eine ausführliche Erklärung – inklusive Begriffserklärungen, Konfigurationsbeispiele und
häufige Fragen – findest du in [RATE_LIMITING.md](RATE_LIMITING.md).

### Security Headers

Die Anwendung aktiviert zentral im `SecurityHeaders`-Hook (`src/middlewares/security-headers.hook.ts`)
eine Reihe von HTTP-Response-Headern. Diese Header sind kleine Zusatzinformationen in jeder
Server-Antwort. Browser lesen sie aus und verhalten sich dadurch sicherer.

Die wichtigsten konfigurierten Header sind:

| Header                             | Zweck                                                                                                               | Verhalten in diesem Projekt                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Strict-Transport-Security` (HSTS) | Sagt dem Browser: „Sprich mit dieser Domain künftig nur noch über HTTPS.“                                           | **Nur in Production** aktiv, mit `max-age=31536000; includeSubDomains; preload`                            |
| `Content-Security-Policy` (CSP)    | Erlaubt nur definierte Quellen für Skripte, Styles, Bilder usw. und reduziert damit XSS-Risiken                     | Aktiv, inklusive `report-uri /csp-violation-report`                                                        |
| `X-Frame-Options: DENY`            | Verhindert Clickjacking, also das Einbetten der Seite in fremde `iframe`s                                           | Aktiv                                                                                                      |
| `X-Content-Type-Options: nosniff`  | Verhindert, dass Browser Dateitypen „erraten“ und dadurch gefährliche Inhalte falsch ausführen                      | Aktiv                                                                                                      |
| `Referrer-Policy: no-referrer`     | Verhindert, dass Zielseiten unnötig erfahren, von welcher URL ein Benutzer kam                                      | Aktiv                                                                                                      |
| `Permissions-Policy`               | Deaktiviert Browser-Funktionen wie Kamera, Mikrofon oder Geolocation, sofern die Anwendung sie nicht braucht        | Aktiv                                                                                                      |
| `X-Download-Options: noopen`       | Schutz für ältere IE/Legacy-Browser, damit heruntergeladene HTML-Dateien nicht im Kontext der Seite geöffnet werden | Aktiv                                                                                                      |
| `X-XSS-Protection: 0`              | Alter Legacy-Header für veraltete Browser-XSS-Filter                                                                | Aktiv, aber bewusst auf `0`, weil moderne Browser auf CSP setzen und alte Filter problematisch sein können |
| `Expect-CT`                        | Historischer Header rund um Certificate Transparency                                                                | **Nur in Production** aktiv, damit Security-Scanner den Header sehen                                       |

#### Warum sind manche Header nur in Production aktiv?

- **HSTS** ist in lokalen Entwicklungsumgebungen oft hinderlich, weil ein Browser sich merken
  würde, dass eine Domain nur noch über HTTPS erreichbar sein soll.
- **Expect-CT** ist heute eher ein Kompatibilitäts-/Scanner-Header als ein alltägliches
  Schutzinstrument. Deshalb wird er nur dort gesendet, wo er relevant ist: in Production.

#### HTTPS-Weiterleitung in Production

Zusätzlich zu den Response-Headern erzwingt der Hook in Production HTTPS. Wenn eine Anfrage
noch per HTTP eingeht, antwortet die Anwendung mit einem `308 Permanent Redirect` auf die
HTTPS-Variante der URL. So werden auch Formulare oder `POST`-Requests korrekt auf HTTPS
umgeleitet, ohne die HTTP-Methode zu verlieren.

#### Relevante Konfigurationswerte

Die Basis-Konfiguration liegt in `config/default.json`:

- `security.helmet.enabled` – aktiviert/deaktiviert den Security-Header-Hook
- `security.helmet.enforceHttpsInProduction` – erzwingt HTTPS-Redirects in Production
- `security.helmet.trustProxy` – wertet `X-Forwarded-Proto` aus, wenn die App hinter einem Proxy läuft
- `security.helmet.referrerPolicy` – steuert den `Referrer-Policy`-Header
- `security.helmet.csp.reportUri` – Zielpfad für CSP-Verletzungsberichte

> **Hinweis:** Für eine gute Bewertung in Tools wie **SecurityHeaders.com** muss die Anwendung
> in Production tatsächlich per HTTPS ausgeliefert werden. HSTS und HTTPS-Redirects helfen nur,
> wenn vor der App auch ein TLS-fähiger Proxy / Load-Balancer korrekt konfiguriert ist.

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

| Script                    | Beschreibung                       |
| ------------------------- | ---------------------------------- |
| `npm run build`           | Projekt für Production kompilieren |
| `npm start`               | Production-Server starten          |
| `npm run dev`             | Development-Server mit Hot-Reload  |
| `npm run backendDev`      | DB starten + Development-Server    |
| `npm run test`            | Unit-Tests im Watch-Mode           |
| `npm run e2e`             | E2E-Tests im Watch-Mode            |
| `npm run lint`            | Code mit ESLint prüfen             |
| `npm run lint:fix`        | Code-Probleme automatisch beheben  |
| `npm run format`          | Code mit Prettier formatieren      |
| `npm run format:check`    | Formatierung prüfen                |
| `npm run makemigrations`  | Neue Datenbank-Migration erstellen |
| `npm run migrations`      | Migrationen ausführen              |
| `npm run revertmigration` | Letzte Migration zurückrollen      |
| `npm run db:start`        | PostgreSQL starten                 |
| `npm run db:stop`         | PostgreSQL stoppen                 |
| `npm run db:restart`      | PostgreSQL neu starten             |
| `npm run db:status`       | PostgreSQL-Status anzeigen         |

## 📄 Lizenz

MIT

---

**Entwickelt mit [FoalTS](https://foalts.org/)**
