# B1T Ordinals Wallet - Entwicklungsstatus

**Projekt:** Moderne Web-Wallet für B1T Blockchain mit Ordinals-Support  
**Start:** 01.10.2025  
**Aktueller Stand:** Setup & Phase 1 in Entwicklung

---

## 📊 Projektphasen

### ✅ Phase 0: Projekt-Setup
- [x] Projekt-Struktur erstellt
- [x] Docker-Compose Setup
- [x] Status-Tracking eingerichtet

### ✅ Phase 1: Basis-Wallet (ABGESCHLOSSEN)
- [x] RPC-Integration mit B1T Core Node
- [x] Seed-Import (BIP39-kompatibel mit BitWebWallet)
- [x] Wallet-Generierung & Adressverwaltung
- [x] Guthaben anzeigen (Balance)
- [x] Empfangen-Funktion mit QR-Code-Generator
- [x] Senden-Funktion (B1T Transaktionen)
- [x] Modernes Dark/Orange UI Design
- [x] Animationen & Transitions

### 📅 Phase 2: Ordinals Anzeige (GEPLANT)
- [ ] Ordinals/Inscriptions auflisten
- [ ] Detail-Ansicht für Inscriptions
- [ ] Bild-Vorschau für NFTs

### 📅 Phase 3: Inscriptions erstellen (GEPLANT)
- [ ] Bild-Upload (PNG, JPG, GIF, SVG)
- [ ] Automatische Komprimierung & Optimierung
- [ ] Inscription-Vorschau
- [ ] OP_RETURN Integration
- [ ] Fee-Kalkulation

### 📅 Phase 4: Ordinals senden (GEPLANT)
- [ ] Ordinals-Transfer-Funktion
- [ ] UTXO-Management für Inscriptions
- [ ] Sicherheitsabfragen

---

## 🏗️ Technischer Stack

### Frontend
- **Framework:** React 18 + TypeScript
- **Styling:** TailwindCSS (Dark Theme + Orange Accents)
- **Animationen:** Framer Motion
- **QR-Codes:** qrcode.react
- **State Management:** React Context API + useState/useReducer
- **Build:** Vite

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express.js
- **B1T Library:** bitcore-lib-b1t (geplant)
- **RPC Client:** Custom Bitcoin RPC Client
- **Sicherheit:** CORS, Rate Limiting

### Infrastruktur
- **Container:** Docker + Docker Compose
- **Netzwerk:** Bridge-Netzwerk für Core-Node-Kommunikation
- **Deployment:** Lokal → später B1Twallet.com

---

## 🔗 B1T Blockchain Parameter

**Chain:** B1T (Bitcoin-Fork)  
**SLIP-044 Coin Type:** 3141 (0x80000c45)  
**RPC Port:** 8332  
**P2P Port:** 8333  
**Address Prefix:** 0x19 (25)  
**BIP44 Path:** m/44'/3141'/0'/0/x  
**Seed-Format:** BIP39/BIP44

---

## 📝 Aktuelle Aufgaben

1. ✅ Projekt-Struktur erstellen
2. ✅ Docker-Compose für Frontend + Backend
3. ✅ React-App mit TailwindCSS & Framer Motion
4. ✅ Backend RPC-Proxy für B1T Core
5. ✅ Wallet-Core-Funktionen implementieren

**Phase 1 ist komplett!** Nächste Schritte:
- Wallet testen mit echtem B1T Core Node
- Phase 2 planen (Ordinals-Integration)

---

## 🎨 Design-Specs

**Farbschema:**
- Primär: Orange (#FF6B00, #FF8C00)
- Hintergrund: Dark (#0A0A0A, #1A1A1A, #2A2A2A)
- Akzente: Orange-Verläufe
- Text: White (#FFFFFF), Gray (#A0A0A0)

**Features:**
- Smooth Transitions
- Animated Buttons & Cards
- Loading States mit Animationen
- Glassmorphism-Effekte (optional)

---

## 🐛 Bekannte Probleme
- Keine aktuellen Issues

---

## 📌 Notizen

- RPC-Credentials aus bit.conf: user/changeme (für Dev)
- Logo: B1T-logo.png vorhanden
- Kompatibilität mit BitWebWallet-Seeds gewährleistet
- Ordinals-Indexer wird erst in Phase 2+ benötigt

---

## 🔄 Letzte Updates

**01.10.2025 - Phase 1 Abgeschlossen + Bugfixes! 🎉**
- 🔧 SLIP-044 Coin Type 3141 korrigiert (war: 0, jetzt: 3141)
- 🔧 Fallback für fehlende addressindex-RPC implementiert
- 🔧 scantxoutset für Balance/UTXO-Abfrage ohne addressindex

**01.10.2025 - Phase 1 Initial**
- ✅ Vollständige Projekt-Struktur erstellt
- ✅ Docker-Compose Setup fertiggestellt
- ✅ Backend mit RPC-Client implementiert
- ✅ Frontend mit React + TailwindCSS + Framer Motion
- ✅ Alle Basis-Wallet-Funktionen implementiert:
  - Wallet erstellen & importieren (BIP39)
  - Guthaben anzeigen
  - B1T empfangen (mit QR-Code)
  - B1T senden (vollständige TX-Erstellung)
- ✅ Modernes Dark/Orange UI Design
- ✅ README.md mit vollständiger Dokumentation

**Nächste Schritte:**
1. Wallet mit echtem B1T Core Node testen
2. Ggf. Bugfixes nach Tests
3. Phase 2 starten (Ordinals-Anzeige)

---

*Diese Datei wird kontinuierlich aktualisiert.*

