# Sicherheitsanalyse B1T Wallet

## Zusammenfassung

Diese Analyse identifiziert **17 Sicherheitsprobleme** verschiedener Schweregrade im B1T Wallet Code. Die meisten kritischen Probleme befinden sich in der Docker-Konfiguration und im Logging.

---

## 1. KRITISCHE SICHERHEITSPROBLEME

### 1.1 Hardcoded Secrets in docker-compose.yml
**Datei:** `docker-compose.yml`  
**Zeilen:** 11-12, 24, 42, 69-70, 77-78, 119-121  
**Schweregrad:** 🔴 KRITISCH

**Problem:** Passwörter und Zugangsdaten sind als Klartext in der Docker-Compose-Datei hartkodiert:
```yaml
RPC_PASSWORD: changeme
DB_PASSWORD: b1tpass
POSTGRES_PASSWORD: b1tpass
```

**Risiko:** 
- Credentials werden im Git-Repository gespeichert
- Container-Logs enthalten diese Werte
- Jeder mit Zugriff auf das Repository hat vollen Zugriff auf die Datenbank und RPC-Node

**Empfohlene Lösung:**
```yaml
environment:
  - RPC_PASSWORD=${RPC_PASSWORD}
  - DB_PASSWORD=${DB_PASSWORD}
  - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
```
Verwendung von Docker Secrets oder Environment-Dateien außerhalb des Repositories.

---

### 1.2 RPC Credentials in Healthcheck exponiert
**Datei:** `docker-compose.yml`  
**Zeile:** 24  
**Schweregrad:** 🔴 KRITISCH

**Problem:** Die Healthcheck-Konfiguration enthält RPC-Credentials im Klartext:
```yaml
test: ["CMD-SHELL", "curl -sf -u user:changeme ..."]
```

**Risiko:** 
- Credentials erscheinen in Docker-Logs und Container-Inspektionen
- Prozess-Liste zeigt Credentials an

**Empfohlene Lösung:** Verwendung einer separaten Healthcheck-Datei oder Umgebungsvariablen.

---

### 1.3 RPC-Zugriff von überall erlaubt (0.0.0.0/0)
**Datei:** `docker-compose.yml`  
**Zeile:** 13  
**Schweregrad:** 🔴 KRITISCH

**Problem:** 
```yaml
RPC_ALLOW_IP: 0.0.0.0/0
```

**Risiko:** Jeder Host im Netzwerk kann auf den RPC-Port zugreifen, wenn dieser exponiert wird.

**Empfohlene Lösung:** Auf interne Netzwerke beschränken:
```yaml
RPC_ALLOW_IP: 172.16.0.0/12
```

---

### 1.4 Fehlende Authentifizierung/Autorisierung
**Datei:** `backend/src/server.js`, alle Route-Dateien  
**Schweregrad:** 🔴 KRITISCH

**Problem:** Das Backend hat KEINE Authentifizierung. Jeder kann:
- Transaktionen broadcasten
- Wallet-Operationen durchführen
- Mnemonics an den Server senden
- Alle API-Endpunkte ohne Authentifizierung nutzen

**Beispiel aus wallet.js:**
```javascript
router.post('/derive-address', (req, res) => {
  const { mnemonic } = req.body;  // Mnemonic wird ungeschützt übertragen!
  // ...
});
```

**Risiko:** 
- Man-in-the-Middle-Angriffe können Mnemonics abfangen
- Keine Zugriffskontrolle auf sensible Operationen

**Empfohlene Lösung:** Implementierung von JWT-Authentifizierung oder API-Keys für alle sensiblen Endpunkte.

---

### 1.5 Mnemonic wird über HTTP übertragen
**Datei:** `backend/src/routes/wallet.js`  
**Zeilen:** 55-75, 77-107, 110-142  
**Schweregrad:** 🔴 KRITISCH

**Problem:** Mnemonics werden im Klartext über HTTP-POST an den Server gesendet:
```javascript
router.post('/derive-address', (req, res) => {
  const { mnemonic, index = 0, change = 0 } = req.body;
  // ...
});
```

**Risiko:** 
- Mnemonics können abgehört werden (keine HTTPS-Erzwingung)
- Server-Logs könnten Mnemonics enthalten
- Memory-Dumps enthalten Mnemonics

**Empfohlene Lösung:** Ableitung sollte client-seitig erfolgen (wie bereits in keyService.js implementiert) und NIE an den Server gesendet werden. Die Endpunkte sollten entfernt werden.

---

## 2. HOCH RISIKO PROBLEME

### 2.1 Fehlendes HTTPS/TLS
**Datei:** `docker-compose.yml`, `backend/src/server.js`  
**Schweregrad:** 🟠 HOCH

**Problem:** 
- Keine TLS-Konfiguration im Backend
- Keine HTTPS-Umleitung
- Port 3005 ist HTTP-only

**Risiko:** 
- Alle Daten werden unverschlüsselt übertragen
- Man-in-the-Middle-Angriffe möglich
- Session-Hijacking

**Empfohlene Lösung:** Implementierung von HTTPS mit Let's Encrypt oder Nutzung eines Reverse-Proxies (nginx/traefik) mit TLS-Terminierung.

---

### 2.2 Unzureichende PBKDF2-Iterationen (600.000)
**Datei:** `frontend/src/services/crypto.js`  
**Zeile:** 8  
**Schweregrad:** 🟠 HOCH

**Problem:**
```javascript
const ITERATIONS = 600000;
```

**Risiko:** 600.000 Iterationen sind für moderne Hardware nicht ausreichend. OWASP empfiehlt mindestens 1.000.000 Iterationen für PBKDF2-SHA256.

**Empfohlene Lösung:** Erhöhung auf mindestens 1.000.000 Iterationen oder Umstellung auf Argon2id.

---

### 2.3 CORS erlaubt alle Localhost-Ports
**Datei:** `backend/src/server.js`  
**Zeilen:** 36-45  
**Schweregrad:** 🟠 HOCH

**Problem:**
```javascript
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
    if (/^http:\/\/(127\.0\.0\.1|192\.168\.|172\.)\d*:\d+$/.test(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));
```

**Risiko:** 
- Jede Anwendung auf localhost kann auf die API zugreifen
- Angreifer-Websites könnten lokal laufen
- Keine Prüfung des Ports

**Empfohlene Lösung:** Explizite Auflistung erlaubter Origins ohne Wildcards.

---

### 2.4 Fehlende Rate-Limiting auf kritischen Endpunkten
**Datei:** `backend/src/server.js`  
**Zeilen:** 47-60  
**Schweregrad:** 🟠 HOCH

**Problem:** Mining-Endpunkte sind von Rate-Limiting ausgenommen:
```javascript
const rabb1tsPaths = [
  '/wallet/rabb1ts/',
  '/wallet/broadcast',
];
const limiter = rateLimit({
  max: 500000,  // Sehr hohes Limit!
  skip: (req) => rabb1tsPaths.some(p => req.path.startsWith(p)),
});
```

**Risiko:** 
- DDoS-Angriffe auf Broadcast-Endpunkt möglich
- Ressourcen-Exhaustion

**Empfohlene Lösung:** Separate Rate-Limiting-Konfiguration für Mining-Endpunkte mit niedrigeren Limits.

---

### 2.5 Unsichere Zufallszahlengenerierung (Math.random)
**Datei:** `frontend/src/pages/CreateWallet.jsx`  
**Zeile:** 35  
**Schweregrad:** 🟠 HOCH

**Problem:**
```javascript
const r = Math.floor(Math.random() * words.length);
```

**Risiko:** Math.random() ist nicht kryptographisch sicher und sollte nicht für Sicherheitskritische Operationen verwendet werden.

**Empfohlene Lösung:** Verwendung von `crypto.getRandomValues()`:
```javascript
const r = crypto.getRandomValues(new Uint32Array(1))[0] % words.length;
```

---

## 3. MITTLERES RISIKO PROBLEME

### 3.1 Sensiblen Daten in Logs
**Datei:** `backend/src/server.js`  
**Zeile:** 79  
**Schweregrad:** 🟡 MITTEL

**Problem:**
```javascript
app.post('/api/debug/log', (req, res) => {
  const { level, message, data } = req.body;
  console.log(`[FE-${level || 'INFO'}] ${timestamp}: ${message}`, data || '');
});
```

**Risiko:** 
- Frontend kann beliebige Daten loggen
- Potenzielle PII-Exposure
- Log-Injection-Angriffe

**Empfohlene Lösung:** Entfernen oder strenges Input-Validation implementieren.

---

### 3.2 Fehlende Eingabevalidierung auf hexData
**Datei:** `backend/src/routes/ordinals.js`  
**Zeilen:** 58-65  
**Schweregrad:** 🟡 MITTEL

**Problem:**
```javascript
if (!/^[a-fA-F0-9]*$/.test(hexData)) {
  return res.status(400).json({ success: false, error: 'hexData must be a valid hex string' });
}
```

Die Validierung ist vorhanden, aber es gibt keine Längenbegrenzung außer der 400KB-Grenze.

**Risiko:** Buffer-Overflow oder Memory-Exhaustion durch sehr große hex-Strings.

**Empfohlene Lösung:** Zusätzliche Längenvalidierung vor der Regex-Prüfung.

---

### 3.3 Unsichere Content-Type-Header
**Datei:** `backend/src/routes/ordinals.js`  
**Zeile:** 418  
**Schweregrad:** 🟡 MITTEL

**Problem:**
```javascript
res.set('Content-Type', content_type || 'application/octet-stream');
```

**Risiko:** 
- Content-Type wird aus Benutzer-Input (DB) übernommen
- XSS durch unsichere Content-Types möglich

**Empfohlene Lösung:** Whitelist-basierte Content-Type-Validierung.

---

### 3.4 Fehlende Prepared Statements bei Bulk-Insert
**Datei:** `backend/src/services/db.js`  
**Zeilen:** 200-214, 267-295  
**Schweregrad:** 🟡 MITTEL

**Problem:** Dynamische Query-Generierung für Bulk-Inserts:
```javascript
const values = [];
const params = [];
let i = 1;
for (const r of rows) {
  values.push(`($${i},$${i+1},$${i+2},$${i+3},$${i+4},$${i+5})`);
  params.push(r.txid, r.block_height ?? null, r.time ?? null, r.size ?? null, r.vsize ?? null, r.version ?? null);
  i += 6;
}
```

Obwohl Parameterized Queries verwendet werden, ist die dynamische Generierung riskant.

**Risiko:** Bei Fehlern in der Logik könnte SQL-Injection entstehen.

**Empfohlene Lösung:** Verwendung von pg-format oder ähnlichen Bibliotheken für Bulk-Operations.

---

### 3.5 Ord-Indexer URL nicht validiert
**Datei:** `backend/src/routes/ordinals.js`  
**Zeile:** 602  
**Schweregrad:** 🟡 MITTEL

**Problem:**
```javascript
const ORD_URL = process.env.ORD_INDEXER_URL || 'http://localhost:8080';
```

**Risiko:** 
- SSRF-Angriffe möglich wenn Umgebungsvariable manipuliert wird
- Keine Validierung der URL

**Empfohlene Lösung:** URL-Validierung und Whitelist der erlaubten Hosts.

---

### 3.6 Fehlende Zeitlimits bei RPC-Calls
**Datei:** `backend/src/routes/wallet.js`  
**Zeilen:** 709-721  
**Schweregrad:** 🟡 MITTEL

**Problem:** Parallele RPC-Calls ohne ausreichende Timeouts:
```javascript
const results = await Promise.all(chunk.map(async (seq) => {
  const rawTx = await rpcClient.call('createrawtransaction', [...], 60000);
  // ...
}));
```

**Risiko:** 
- Ressourcen-Exhaustion durch hängende Verbindungen
- DoS durch langsame Antworten

**Empfohlene Lösung:** Implementierung von Circuit-Breakern und kürzeren Timeouts.

---

## 4. NIEDRIGES RISIKO PROBLEME

### 4.1 Veraltete bip32 Konstanten
**Datei:** `backend/src/routes/wallet.js`, `frontend/src/services/keyService.js`  
**Zeilen:** 17-27, 12-18  
**Schweregrad:** 🟢 NIEDRIG

**Problem:** Netzwerk-Parameter sind hardcoded.

**Risiko:** Änderungen an den Netzwerkparametern erfordern Code-Änderungen.

**Empfohlene Lösung:** Auslagern in Konfigurationsdateien.

---

### 4.2 Fehlende Content Security Policy (CSP)
**Datei:** `backend/src/server.js`  
**Schweregrad:** 🟢 NIEDRIG

**Problem:** CSP ist konfiguriert, aber sehr permissiv:
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "frame-ancestors": ["'self'", ...allowedOrigins],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
```

**Empfohlene Lösung:** Strengere CSP-Richtlinien implementieren.

---

### 4.3 Fehlende X-Frame-Options
**Datei:** `backend/src/routes/ordinals.js`  
**Zeile:** 803  
**Schweregrad:** 🟢 NIEDRIG

**Problem:**
```javascript
res.removeHeader('X-Frame-Options');
```

**Risiko:** Clickjacking-Angriffe möglich.

**Empfohlene Lösung:** Beibehalten von X-Frame-Options oder strikte CSP frame-ancestors.

---

## 5. EMPFEHLUNGEN

### Sofortige Maßnahmen (Kritisch)
1. Alle Secrets aus docker-compose.yml entfernen und in .env-Dateien auslagern
2. RPC_ALLOW_IP auf interne Netzwerke beschränken
3. Authentifizierung für alle API-Endpunkte implementieren
4. Mnemonic-Übertragung an Server verhindern - nur client-seitige Ableitung
5. HTTPS/TLS implementieren

### Kurzfristige Maßnahmen (Hoch)
1. PBKDF2-Iterationen auf 1.000.000+ erhöhen
2. CORS-Konfiguration einschränken
3. Rate-Limiting für alle Endpunkte implementieren
4. Math.random durch crypto.getRandomValues ersetzen

### Langfristige Maßnahmen (Mittel/Niedrig)
1. Strengere Input-Validierung implementieren
2. Content-Type-Whitelist erstellen
3. CSP-Richtlinien verschärfen
4. Audit-Logging implementieren
5. Penetrationstests durchführen

---

## 6. COMPLIANCE & BEST PRACTICES

### Nicht erfüllt:
- ❌ OWASP ASVS Level 1 (Authentication)
- ❌ PCI DSS (Secure Transmission)
- ❌ GDPR (Data Protection - Mnemonic in Logs)
- ❌ CIS Docker Benchmark (Secrets Management)

### Empfohlene Frameworks:
- OWASP ASVS 4.0
- NIST Cybersecurity Framework
- CIS Controls

---

**Analyse erstellt am:** 2025-01-XX  
**Analyst:** AI Security Assistant  
**Scope:** /root/b1twallet.org
