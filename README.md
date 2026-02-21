# B1T Ordinals Wallet

**Non-custodial web wallet for B1T Blockchain with Ordinals support**

<img width="2044" height="1662" alt="B1T Wallet" src="https://github.com/user-attachments/assets/53416253-bdc5-4331-ac94-5853009c5a45" />

---

## Features
- Create & import wallet (BIP39)
- Send & receive B1T with QR codes
- Display & create Ordinals/Inscriptions
- Modern Dark/Orange UI
- Docker deployment ready

### ✅ Phase 1 (Current)
- ✅ Create & import wallet (BIP39-compatible)
- ✅ Display balance
- ✅ Receive B1T with QR code generator
- ✅ Send B1T (complete transaction creation)
- ✅ Modern Dark/Orange UI with animations
- ✅ RPC integration with B1T Core Node
- ✅ Docker setup for easy deployment

### ✅ Ordinals (integriert)
- ✅ Display Ordinals/Inscriptions
- ✅ Create Inscriptions (with image compression)
- 🔜 Transfer Ordinals (in Planung)

---

## Quick Start with Docker

### Prerequisites
- Docker & Docker Compose
- Automated B1T Core Node (included in Docker)

### 1. Clone & Start
```bash
git clone https://github.com/OnlyPW/b1twallet.org.git
cd b1twallet.org
docker-compose up --build
```
AND WAIT, Rust compiling needs time.

Done! Access at:
- **Wallet:** http://localhost:3000
- **API:** http://localhost:3001

---

## Configuration

RPC credentials in `backend/.env`:
```env
RPC_HOST=bitcore
RPC_PORT=8332
RPC_USER=user
RPC_PASSWORD=changeme
```

---

## Security

- **Non-Custodial:** Private keys never leave your browser
- **BIP39/BIP44:** Compatible with other wallets
- **Open Source:** Fully transparent

> Keep your seed safe - lost seed = lost wallet

---

## Links

- **B1T Core:** https://github.com/bittoshimoto/Bit
- **License:** MIT

---

**Made with orange heart by B1T Labs**
