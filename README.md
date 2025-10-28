# 🚀 B1T Ordinals Wallet

**Modern, non-custodial web wallet for B1T Blockchain with Ordinals support**

<img width="2044" height="1662" alt="grafik" src="https://github.com/user-attachments/assets/53416253-bdc5-4331-ac94-5853009c5a45" />


---

## 🌟 Features

### ✅ Phase 1 (Current)
- ✅ Create & import wallet (BIP39-compatible)
- ✅ Display balance
- ✅ Receive B1T with QR code generator
- ✅ Send B1T (complete transaction creation)
- ✅ Modern Dark/Orange UI with animations
- ✅ RPC integration with B1T Core Node
- ✅ Docker setup for easy deployment

### 📅 Phase 2-4 (Planned)
- 🔜 Display Ordinals/Inscriptions
- 🔜 Create Inscriptions (with image compression)
- 🔜 Transfer Ordinals

---

## 🏗️ Technical Stack

**Frontend:**
- React 18 + TypeScript
- TailwindCSS (Dark Theme + Orange Accents)
- Framer Motion (Animations)
- Vite (Build Tool)

**Backend:**
- Node.js 20+ with Express
- Bitcoin RPC Client
- BIP39/BIP32 for HD Wallets
- bitcoinjs-lib for transactions

**Infrastructure:**
- Docker + Docker Compose
- B1T Core Node (RPC)

---

## 🚀 Installation & Setup

### Prerequisites
- Docker & Docker Compose installed
- B1T Core Node running and synchronized
- Node.js 20+ (for local development)

### 1. Clone repository
```bash
cd F:\OrB1T
```

### 2. Copy logo
The logo `B1T-logo.png` must be copied to `frontend/public/`:
```bash
mkdir -p frontend/public
copy B1T-logo.png frontend\public\B1T-logo.png
```

### 3. Create backend .env
```bash
cd backend
copy .env.example .env
# Adjust RPC credentials if necessary
```

### 4. Start with Docker
```bash
cd ..
docker-compose up --build
```

The wallet is then accessible at:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/health

### 5. Alternative: Local development

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

## 🔧 Configuration

### B1T Core Node RPC
The wallet connects to your B1T Core Node via RPC.
Configure in `backend/.env`:

```env
RPC_HOST=host.docker.internal  # or IP of the node
RPC_PORT=8332
RPC_USER=user
RPC_PASSWORD=changeme
```

### Network Parameters
The wallet uses B1T blockchain parameters:
- **SLIP-044 Coin Type:** 3141 (0x80000c45)
- **Address Prefix:** 0x19 (25 decimal)
- **P2SH Prefix:** 0x55 (85 decimal)
- **WIF Prefix:** 0x99 (153 decimal)
- **BIP44 Path:** m/44'/3141'/0'/0/x

---

## 📖 Usage

### Create wallet
1. Navigate to "Create new wallet"
2. **Important:** Write down your 12-word recovery seed on paper
3. Confirm by verification
4. Wallet will be automatically unlocked

### Import wallet
1. Navigate to "Import wallet"
2. Enter your BIP39 seed (12 or 24 words)
3. Wallet is compatible with BitWebWallet seeds

### Send B1T
1. Go to Dashboard → "Send B1T"
2. Enter recipient address
3. Choose amount (or click "MAX")
4. Fee will be automatically estimated
5. Submit transaction

### Receive B1T
1. Go to "Receive"
2. QR code will be displayed
3. Copy address or download QR code
4. Share with sender

---

## 🔒 Security

- **Non-Custodial:** Your private keys never leave your browser
- **No server storage:** Seeds are kept locally in browser (localStorage) until logout/cache clearing
- **BIP39/BIP44 Standard:** Compatible with other wallets
- **Open Source:** Fully transparent

### ⚠️ Important Notes
- Keep your recovery seed safe
- Never share your seed with others
- If the seed is lost, the wallet is irrecoverably lost
- This wallet is for development and testing purposes - use with caution

---

## 📁 Project Structure

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
│   │   └── store/            # State Store
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml    # Docker Setup
├── bit.conf              # B1T Core Config
├── STATUS.md             # Development Status
└── README.md             # This file
```

---

## 🐛 Troubleshooting

### Backend won't start
- Check if B1T Core Node is running: `docker ps`
- RPC credentials in `.env` correct?
- Port 8332 reachable?

### Frontend can't reach backend
- Backend running on port 3001?
- CORS settings correct?
- `VITE_API_URL` set in frontend?

### Transactions fail
- Enough B1T balance?
- Network fee sufficient?
- UTXOs available? (Check with `/api/wallet/utxos/:address`)

---

## 🛠️ Development

### Track status
See `STATUS.md` for current development status.

### Test API
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

- [x] Phase 0: Project Setup
- [x] Phase 1: Basic Wallet (Send, Receive, Balance)
- [ ] Phase 2: Display Ordinals
- [ ] Phase 3: Create Inscriptions
- [ ] Phase 4: Transfer Ordinals
- [ ] Phase 5: Hardware Wallet Support
- [ ] Phase 6: Multi-Sig Support

---

## 👥 Contributing

This project is Open Source. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to branch
5. Create a pull request

---

## 📄 License

MIT License - see LICENSE file

---

## 🔗 Links

- **BitWebWallet:** https://github.com/gonner22/BitWebWallet
- **B1T Core:** https://github.com/bittoshimoto/Bit
- **B1T Labs Discord:** [Coming Soon]

---

## 💬 Support

For questions or issues:
- Create an issue on GitHub
- Contact B1T Labs on Discord
- Check `STATUS.md` for known issues

---

**Made with 🧡 by B1T Labs**

*Be your own Bank. Don't trust, Verify!*
