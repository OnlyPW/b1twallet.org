# 🚀 B1T Ordinals Wallet

**Moderne, non-custodial Web-Wallet für B1T Blockchain mit Ordinals-Support**

![B1T Logo](B1T-logo.png)

---

## 🌟 Features

### ✅ Phase 1 (Aktuell)
- ✅ Wallet erstellen & importieren (BIP39-kompatibel)
- ✅ Guthaben anzeigen
- ✅ B1T empfangen mit QR-Code-Generator
- ✅ B1T senden (vollständige Transaktionserstellung)
- ✅ Modernes Dark/Orange UI mit Animationen
- ✅ RPC-Integration mit B1T Core Node
- ✅ Docker-Setup für einfaches Deployment

### 📅 Phase 2-4 (Geplant)
- 🔜 Ordinals/Inscriptions anzeigen
- 🔜 Inscriptions erstellen (mit Bildkomprimierung)
- 🔜 Ordinals übertragen

---

## 🏗️ Technischer Stack

**Frontend:**
- React 18 + TypeScript
- TailwindCSS (Dark Theme + Orange Accents)
- Framer Motion (Animationen)
- Vite (Build Tool)

**Backend:**
- Node.js 20+ mit Express
- Bitcoin RPC Client
- BIP39/BIP32 für HD Wallets
- bitcoinjs-lib für Transaktionen

**Infrastruktur:**
- Docker + Docker Compose
- B1T Core Node (RPC)

---

## 🚀 Installation & Start

### Voraussetzungen
- Docker & Docker Compose installiert
- B1T Core Node läuft und ist synchronisiert
- Node.js 20+ (für lokale Entwicklung)

### 1. Repository klonen
```bash
cd F:\OrB1T
```

### 2. Logo kopieren
Das Logo `B1T-logo.png` muss in `frontend/public/` kopiert werden:
```bash
mkdir -p frontend/public
copy B1T-logo.png frontend\public\B1T-logo.png
```

### 3. Backend .env erstellen
```bash
cd backend
copy .env.example .env
# Passen Sie RPC-Credentials an falls nötig
```

### 4. Mit Docker starten
```bash
cd ..
docker-compose up --build
```

Die Wallet ist dann erreichbar unter:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/health

### 5. Alternativ: Lokale Entwicklung

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## 🔧 Konfiguration

### B1T Core Node RPC
Die Wallet verbindet sich mit Ihrem B1T Core Node via RPC. 
Anpassen in `backend/.env`:

```env
RPC_HOST=host.docker.internal  # oder IP des Nodes
RPC_PORT=8332
RPC_USER=user
RPC_PASSWORD=changeme
```

### Netzwerk-Parameter
Die Wallet nutzt die B1T Blockchain-Parameter:
- **SLIP-044 Coin Type:** 3141 (0x80000c45)
- **Address Prefix:** 0x19 (25 decimal)
- **P2SH Prefix:** 0x55 (85 decimal)
- **WIF Prefix:** 0x99 (153 decimal)
- **BIP44 Path:** m/44'/3141'/0'/0/x

---

## 📖 Nutzung

### Wallet erstellen
1. Navigiere zu "Neue Wallet erstellen"
2. **Wichtig:** Schreibe deinen 12-Wort Recovery Seed auf Papier
3. Bestätige durch Verifizierung
4. Wallet wird automatisch entsperrt

### Wallet importieren
1. Navigiere zu "Wallet importieren"
2. Gib deinen BIP39 Seed ein (12 oder 24 Wörter)
3. Die Wallet ist kompatibel mit BitWebWallet-Seeds

### B1T senden
1. Gehe zum Dashboard → "B1T senden"
2. Empfänger-Adresse eingeben
3. Betrag wählen (oder "MAX" klicken)
4. Gebühr wird automatisch geschätzt
5. Transaktion absenden

### B1T empfangen
1. Gehe zu "Empfangen"
2. QR-Code wird angezeigt
3. Adresse kopieren oder QR-Code downloaden
4. Teile mit dem Sender

---

## 🔒 Sicherheit

- **Non-Custodial:** Ihre Private Keys verlassen niemals Ihren Browser
- **Keine Server-Speicherung:** Seeds werden lokal im Browser (localStorage) bis zum Logout/Cache-Löschung gehalten
- **BIP39/BIP44 Standard:** Kompatibel mit anderen Wallets
- **Open Source:** Vollständig transparent

### ⚠️ Wichtige Hinweise
- Bewahren Sie Ihren Recovery Seed sicher auf
- Teilen Sie niemals Ihren Seed mit anderen
- Bei Verlust des Seeds ist die Wallet unwiederbringlich verloren
- Diese Wallet ist für Entwicklungs- und Testzwecke - nutzen Sie sie mit Vorsicht

---

## 📁 Projektstruktur

```
OrB1T/
├── backend/              # Node.js Backend (RPC Proxy)
│   ├── src/
│   │   ├── server.js         # Express Server
│   │   ├── routes/           # API Routes
│   │   └── services/         # RPC Client
│   ├── Dockerfile
│   └── package.json
├── frontend/             # React Frontend
│   ├── public/
│   │   └── B1T-logo.png      # Logo
│   ├── src/
│   │   ├── components/       # React Components
│   │   ├── pages/            # Page Components
│   │   ├── services/         # API Service
│   │   └── store/            # Zustand Store
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml    # Docker Setup
├── bit.conf              # B1T Core Config
├── STATUS.md             # Entwicklungsstatus
└── README.md             # Diese Datei
```

---

## 🐛 Troubleshooting

### Backend startet nicht
- Prüfen Sie, ob B1T Core Node läuft: `docker ps`
- RPC-Credentials in `.env` korrekt?
- Port 8332 erreichbar?

### Frontend kann Backend nicht erreichen
- Backend läuft auf Port 3001?
- CORS-Einstellungen korrekt?
- `VITE_API_URL` in Frontend gesetzt?

### Transaktionen schlagen fehl
- Genug B1T-Guthaben?
- Netzwerk-Gebühr ausreichend?
- UTXOs verfügbar? (Prüfe mit `/api/wallet/utxos/:address`)

---

## 🛠️ Entwicklung

### Status verfolgen
Siehe `STATUS.md` für den aktuellen Entwicklungsstand.

### API Testen
```bash
# Health Check
curl http://localhost:3001/health

# RPC Connection Test
curl http://localhost:3001/api/test-connection

# Generate Mnemonic
curl -X POST http://localhost:3001/api/wallet/generate-mnemonic

# Get Balance
curl http://localhost:3001/api/wallet/balance/<ADDRESS>
```

---

## 📝 Roadmap

- [x] Phase 0: Projekt-Setup
- [x] Phase 1: Basis-Wallet (Senden, Empfangen, Guthaben)
- [ ] Phase 2: Ordinals anzeigen
- [ ] Phase 3: Inscriptions erstellen
- [ ] Phase 4: Ordinals übertragen
- [ ] Phase 5: Hardware Wallet Support
- [ ] Phase 6: Multi-Sig Support

---

## 👥 Beitragen

Dieses Projekt ist Open Source. Contributions sind willkommen!

1. Fork das Repository
2. Erstelle einen Feature Branch
3. Commit deine Änderungen
4. Push zum Branch
5. Erstelle einen Pull Request

---

## 📄 Lizenz

MIT License - siehe LICENSE Datei

---

## 🔗 Links

- **BitWebWallet:** https://github.com/gonner22/BitWebWallet
- **B1T Core:** https://github.com/bittoshimoto/Bit
- **B1T Labs Discord:** [Coming Soon]

---

## 💬 Support

Bei Fragen oder Problemen:
- Erstelle ein Issue auf GitHub
- Kontaktiere B1T Labs im Discord
- Prüfe die `STATUS.md` für bekannte Probleme

---

**Made with 🧡 by B1T Labs**

*Be your own Bank. Don't trust, Verify!*

