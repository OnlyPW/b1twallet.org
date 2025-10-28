# B1T Ordinals Wallet - Development Status

**Project:** Modern web wallet for B1T Blockchain with Ordinals support  
**Start:** 01.10.2025  
**Current Status:** Setup & Phase 1 in development

---

## 📊 Project Phases

### ✅ Phase 0: Project Setup
- [x] Project structure created
- [x] Docker Compose setup
- [x] Status tracking established

### ✅ Phase 1: Basic Wallet (COMPLETED)
- [x] RPC integration with B1T Core Node
- [x] Seed import (BIP39-compatible with BitWebWallet)
- [x] Wallet generation & address management
- [x] Display balance
- [x] Receive function with QR code generator
- [x] Send function (B1T transactions)
- [x] Modern Dark/Orange UI design
- [x] Animations & transitions

### 📅 Phase 2: Ordinals Display (PLANNED)
- [ ] List Ordinals/Inscriptions
- [ ] Detail view for Inscriptions
- [ ] Image preview for NFTs

### 📅 Phase 3: Create Inscriptions (PLANNED)
- [ ] Image upload (PNG, JPG, GIF, SVG)
- [ ] Automatic compression & optimization
- [ ] Inscription preview
- [ ] OP_RETURN integration
- [ ] Fee calculation

### 📅 Phase 4: Send Ordinals (PLANNED)
- [ ] Ordinals transfer function
- [ ] UTXO management for Inscriptions
- [ ] Security prompts

---

## 🏗️ Technical Stack

### Frontend
- **Framework:** React 18 + TypeScript
- **Styling:** TailwindCSS (Dark Theme + Orange Accents)
- **Animations:** Framer Motion
- **QR Codes:** qrcode.react
- **State Management:** React Context API + useState/useReducer
- **Build:** Vite

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express.js
- **B1T Library:** bitcore-lib-b1t (planned)
- **RPC Client:** Custom Bitcoin RPC Client
- **Security:** CORS, Rate Limiting

### Infrastructure
- **Container:** Docker + Docker Compose
- **Network:** Bridge network for Core Node communication
- **Deployment:** Local → later B1Twallet.com

---

## 🔗 B1T Blockchain Parameters

**Chain:** B1T (Bitcoin Fork)  
**SLIP-044 Coin Type:** 3141 (0x80000c45)  
**RPC Port:** 8332  
**P2P Port:** 8333  
**Address Prefix:** 0x19 (25)  
**BIP44 Path:** m/44'/3141'/0'/0/x  
**Seed Format:** BIP39/BIP44

---

## 📝 Current Tasks

1. ✅ Create project structure
2. ✅ Docker Compose for Frontend + Backend
3. ✅ React app with TailwindCSS & Framer Motion
4. ✅ Backend RPC proxy for B1T Core
5. ✅ Implement wallet core functions

**Phase 1 is complete!** Next steps:
- Test wallet with real B1T Core Node
- Plan Phase 2 (Ordinals integration)

---

## 🎨 Design Specs

**Color Scheme:**
- Primary: Orange (#FF6B00, #FF8C00)
- Background: Dark (#0A0A0A, #1A1A1A, #2A2A2A)
- Accents: Orange gradients
- Text: White (#FFFFFF), Gray (#A0A0A0)

**Features:**
- Smooth transitions
- Animated buttons & cards
- Loading states with animations
- Glassmorphism effects (optional)

---

## 🐛 Known Issues
- No current issues

---

## 📌 Notes

- RPC credentials from bit.conf: user/changeme (for dev)
- Logo: B1T-logo.png available
- Compatibility with BitWebWallet seeds ensured
- Ordinals indexer will only be needed in Phase 2+

---

## 🔄 Latest Updates

**01.10.2025 - Phase 1 Completed + Bugfixes! 🎉**
- 🔧 SLIP-044 Coin Type 3141 corrected (was: 0, now: 3141)
- 🔧 Fallback for missing addressindex-RPC implemented
- 🔧 scantxoutset for balance/UTXO query without addressindex

**01.10.2025 - Phase 1 Initial**
- ✅ Complete project structure created
- ✅ Docker Compose setup completed
- ✅ Backend with RPC client implemented
- ✅ Frontend with React + TailwindCSS + Framer Motion
- ✅ All basic wallet functions implemented:
  - Create & import wallet (BIP39)
  - Display balance
  - Receive B1T (with QR code)
  - Send B1T (complete TX creation)
- ✅ Modern Dark/Orange UI design
- ✅ README.md with complete documentation

**Next steps:**
1. Test wallet with real B1T Core Node
2. Bugfixes after testing if needed
3. Start Phase 2 (Ordinals display)

---

*This file is continuously updated.*