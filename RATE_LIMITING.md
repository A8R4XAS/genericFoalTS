# Rate Limiting

## Was ist Rate Limiting?

Wenn ein Server öffentlich erreichbar ist, können Clients (Browser, Apps, aber auch bösartige
Skripte) in sehr kurzer Zeit Tausende von Anfragen schicken. Das kann dazu führen, dass:

- **Brute-Force-Angriffe** gelingen (z. B. jemand versucht in Sekunden 10 000 Passwörter gegen den Login-Endpunkt).
- **Der Server überlastet** wird und für alle anderen Nutzer langsam oder unverfügbar wird.

**Rate Limiting** (deutsch: *Anfragebeschränkung*) begrenzt, wie viele Anfragen ein einzelner Client
innerhalb eines bestimmten Zeitfensters senden darf. Wird das Limit überschritten, lehnt der Server
weitere Anfragen vorübergehend ab, bis das Zeitfenster abgelaufen ist.

### Wichtige Begriffe

| Begriff | Bedeutung | Beispiel |
|---------|-----------|---------|
| **Points** | Maximale Anzahl erlaubter Anfragen im Zeitfenster | `120` |
| **Duration** | Länge des Zeitfensters in Sekunden | `60` (= 1 Minute) |
| **Profil** | Ein benanntes Limit-Preset (z. B. `default` oder `auth`) | — |
| **Endpoint-Override** | Feineres Limit für einen spezifischen Endpunkt, das das Profil überschreibt | — |
| **HTTP 429** | Statuscode für „Zu viele Anfragen" (*Too Many Requests*) | — |
| **Retry-After** | Response-Header: wie viele Sekunden der Client warten soll | `30` |

---

## Wie funktioniert es in diesem Projekt?

### 1. Der Hook

Rate Limiting ist als **FoalTS Hook** implementiert (`src/app/hooks/rate-limit.hook.ts`).
Ein Hook ist eine Funktion, die **vor** dem eigentlichen Controller-Method-Code ausgeführt wird.

```
Anfrage kommt an
      │
      ▼
 RateLimit-Hook
      │
      ├─ Limit noch nicht erreicht? → Anfrage wird durchgelassen, Headers werden gesetzt
      │
      └─ Limit überschritten?       → HTTP 429 wird zurückgegeben, Controller wird NICHT aufgerufen
```

### 2. Identifikation des Clients

Der Hook muss wissen, *wer* gerade eine Anfrage stellt, um dessen Zähler zu aktualisieren:

- **Eingeloggter Nutzer** → Nutzer-ID wird als Schlüssel verwendet (`user:42`).
- **Nicht eingeloggter Nutzer** → IP-Adresse des Clients wird verwendet (`192.168.1.1`).

Das stellt sicher, dass ein Angreifer das Limit nicht umgehen kann, indem er nur die IP-Adresse
wechselt, sobald er eingeloggt ist.

### 3. Profile

Es gibt zwei vordefinierte Profile:

| Profil | Beschreibung | Standard-Limit |
|--------|-------------|----------------|
| `default` | Normale API-Endpunkte | 120 Anfragen / 60 Sekunden |
| `auth` | Login, Register und ähnliche Endpunkte | 60 Anfragen / 60 Sekunden |

Auth-Endpunkte haben ein strengeres Limit, weil sie besonders attraktive Ziele für Angriffe sind.

### 4. Endpoint-Overrides

Manchmal braucht ein einzelner Endpunkt ein noch spezifischeres Limit.
Zum Beispiel soll `AuthController.login` maximal 15 Anfragen pro Minute erlauben –
deutlich weniger als das allgemeine Auth-Profil.

Diese Overrides können **ohne Codeänderung** direkt in der Konfigurationsdatei gepflegt werden.

---

## Konfiguration

Die Rate-Limit-Einstellungen befinden sich in `config/default.json` unter dem Schlüssel `rateLimit`:

```json
{
  "rateLimit": {
    "default": {
      "points": 120,
      "duration": 60
    },
    "auth": {
      "points": 60,
      "duration": 60
    },
    "endpoints": {
      "AuthController.login": {
        "points": 15,
        "duration": 60
      },
      "AuthController.register": {
        "points": 25,
        "duration": 60
      }
    }
  }
}
```

### Felder im Überblick

| Pfad | Beschreibung |
|------|-------------|
| `rateLimit.default.points` | Maximale Anfragen für normale API-Endpunkte pro Fenster |
| `rateLimit.default.duration` | Fensterlänge in Sekunden für normale Endpunkte |
| `rateLimit.auth.points` | Maximale Anfragen für Auth-Endpunkte pro Fenster |
| `rateLimit.auth.duration` | Fensterlänge in Sekunden für Auth-Endpunkte |
| `rateLimit.endpoints.<Controller>.<Methode>` | Überschreibt `points`/`duration` für genau diesen Endpunkt |

> **Wichtig:** Der Schlüssel für Endpoint-Overrides folgt dem Format `ControllerName.methodName`,
> also genau so, wie der Controller und die Methode im TypeScript-Code heißen.
> Zum Beispiel: `"AuthController.login"`.

### Limiter anpassen

Um das Limit für einen vorhandenen Endpunkt zu ändern, einfach die entsprechenden Werte in
`config/default.json` anpassen – kein Neustart des Entwicklungsservers nötig beim nächsten Build.

Um einen **neuen** Endpunkt mit eigenem Limit hinzuzufügen:

```json
"endpoints": {
  "ApiController.meinEndpunkt": {
    "points": 10,
    "duration": 60
  }
}
```

---

## Response-Headers

Bei jeder Antwort setzt der Hook folgende HTTP-Header, damit Clients wissen, wie viele
Anfragen noch verbleiben:

| Header | Bedeutung |
|--------|----------|
| `RateLimit-Limit` | Gesamtes Limit im aktuellen Fenster |
| `RateLimit-Remaining` | Noch verbleibende Anfragen im aktuellen Fenster |
| `RateLimit-Reset` | Sekunden bis das Fenster zurückgesetzt wird |
| `X-RateLimit-Limit` | Gleich wie `RateLimit-Limit` (Legacy-Format) |
| `X-RateLimit-Remaining` | Gleich wie `RateLimit-Remaining` (Legacy-Format) |
| `X-RateLimit-Reset` | Gleich wie `RateLimit-Reset` (Legacy-Format) |
| `Retry-After` | Nur bei HTTP 429: Sekunden bis der Client es erneut versuchen darf |

Beide Formate (`RateLimit-*` und `X-RateLimit-*`) werden gesetzt, um eine breite
Kompatibilität mit Clients und API-Gateways sicherzustellen.

### Beispiel-Response bei überschrittenem Limit

```
HTTP/1.1 429 Too Many Requests
RateLimit-Limit: 15
RateLimit-Remaining: 0
RateLimit-Reset: 42
X-RateLimit-Limit: 15
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 42
Retry-After: 42
Content-Type: application/json

{ "error": "Too many requests" }
```

Das bedeutet: Das Limit von 15 Anfragen ist erschöpft. In 42 Sekunden wird das Fenster
zurückgesetzt und der Client darf wieder Anfragen stellen.

---

## Controller-Integration

### AuthController

```typescript
@RateLimit('auth')
export class AuthController {
  // Alle Methoden erhalten automatisch das 'auth'-Profil-Limit.
  // AuthController.login und AuthController.register haben zusätzlich
  // Endpoint-Overrides in der Konfiguration (noch strengere Limits).
}
```

### ApiController

```typescript
@RateLimit('default')
export class ApiController {
  // Alle Methoden erhalten das Standard-Limit aus dem 'default'-Profil.
}
```

---

## Speicher und verteilte Deployments

### In-Memory Store (aktuell)

Die aktuelle Implementierung speichert alle Zähler **im Arbeitsspeicher des Node.js-Prozesses**.
Das funktioniert gut für eine einzelne Server-Instanz, hat aber folgende Einschränkungen:

- **Server-Neustart** → alle Zähler werden zurückgesetzt (Angreifer können kurz neu beginnen).
- **Mehrere Instanzen** → jede Instanz hat ihre eigenen Zähler, das Limit gilt also pro Instanz,
  nicht global (ein Angreifer könnte mehrere Instanzen parallel ausnutzen).

### Redis (Empfehlung für Produktion)

Für Deployments mit mehreren Server-Instanzen (z. B. hinter einem Load Balancer) sollte ein
gemeinsamer, externer Speicher wie **Redis** verwendet werden. Die Library `rate-limiter-flexible`
unterstützt Redis nativ:

```typescript
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from 'redis';

const redisClient = createClient({ url: 'redis://localhost:6379' });
const limiter = new RateLimiterRedis({ storeClient: redisClient, points: 120, duration: 60 });
```

Mit Redis teilen alle Instanzen denselben Zählerstand, das Limit gilt also wirklich global.

---

## Häufige Fragen

**F: Mein Client bekommt ständig 429-Fehler, obwohl er nicht viele Anfragen schickt.**  
A: Möglicherweise teilt er eine IP-Adresse mit anderen Clients (z. B. hinter einem NAT oder Proxy).
In dem Fall helfen benutzerbasierte Identifier (Nutzer-ID nach Login) oder höhere Limits.

**F: Ich möchte Rate Limiting für einen Endpunkt komplett deaktivieren.**  
A: Setze ein sehr hohes `points`-Limit (z. B. `999999`) in `rateLimit.endpoints` für diesen Endpunkt.
Das Entfernen des `@RateLimit()`-Decorators von einem einzelnen Endpunkt ist nicht direkt möglich,
wenn der Decorator auf dem Controller-Level gesetzt ist – in dem Fall am besten die Methode in
einen separaten Controller auslagern.

**F: Wie teste ich Rate Limiting lokal?**  
A: Setze `points` vorübergehend auf `2` und sende drei aufeinanderfolgende Anfragen. Die dritte
sollte HTTP 429 zurückgeben. Danach `points` wieder auf den ursprünglichen Wert zurücksetzen.
