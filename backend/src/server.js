import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import walletRoutes from './routes/wallet.js';
import explorerRoutes from './routes/explorer.js';
import mempoolRoutes from './routes/mempool.js';
import ordinalsRoutes from './routes/ordinals.js';
import rpcClient from './services/rpcClient.js';
import { initSchema, getTipHeight } from './services/db.js';
import { startIndexer } from './indexer/indexer.js';
import { startSync as startOrdinalSync } from './services/ordinalSyncService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security Middleware
const corsOriginEnv = process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3002';
const allowedOrigins = corsOriginEnv.split(',').map(s => s.trim()).filter(Boolean);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "frame-ancestors": ["'self'", ...allowedOrigins, "http://localhost:3000", "http://localhost:3002"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));


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

// Rate Limiting - Rabb1ts Mining Routen ohne Limit
const rabb1tsPaths = [
  '/wallet/rabb1ts/',
  '/wallet/broadcast',
];
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 500000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: (req) => rabb1tsPaths.some(p => req.path.startsWith(p) || req.path === p.replace('/', '')),
});
app.use('/api/', limiter);

// Body Parser (50mb for large image inscriptions)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'B1T Wallet Backend',
    timestamp: new Date().toISOString()
  });
});

// Debug Logging (Frontend -> Backend Logs)
app.post('/api/debug/log', (req, res) => {
  const { level, message, data } = req.body;
  const timestamp = new Date().toISOString();
  console.log(`[FE-${level || 'INFO'}] ${timestamp}: ${message}`, data || '');
  res.json({ success: true });
});

// Ordinals Routes (inscription, estimation, broadcast)
app.use('/api/ordinals', ordinalsRoutes);

// Test RPC Connection
app.get('/api/test-connection', async (req, res) => {
  try {
    const info = await rpcClient.call('getblockchaininfo');
    res.json({
      success: true,
      rpc: {
        chain: info.chain,
        blocks: info.blocks,
        headers: info.headers,
        status: 'online'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Blockchain Status (Block Height)
app.get('/api/blockchain/status', async (req, res) => {
  try {
    const info = await rpcClient.call('getblockchaininfo');
    res.json({
      success: true,
      blocks: info.blocks,
      headers: info.headers,
      chain: info.chain,
      difficulty: info.difficulty,
      mediantime: info.mediantime
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Indexer Status
app.get('/api/indexer-status', async (req, res) => {
  try {
    const enabled = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
    const startHeight = parseInt(process.env.INDEXER_START_HEIGHT || '0', 10);
    let dbTip = -1;
    let chainTip = 0;
    try { dbTip = await getTipHeight(); } catch { }
    try { chainTip = await rpcClient.getBlockCount(); } catch { }
    const progress = chainTip > 0 && dbTip >= 0 ? Math.min(100, Math.round((dbTip / chainTip) * 10000) / 100) : 0;
    const status = !enabled ? 'disabled' : (chainTip > 0 && dbTip >= chainTip ? 'caught_up' : 'syncing');
    res.json({
      success: true,
      enabled,
      startHeight,
      dbTip,
      chainTip,
      progress,
      status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Routes
app.use('/api/wallet', walletRoutes);
app.use('/api/explorer', explorerRoutes);
app.use('/api/mempool', mempoolRoutes);

// Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 B1T Wallet Backend läuft auf Port ${PORT}`);
  console.log(`🔗 RPC Host: ${process.env.RPC_HOST}:${process.env.RPC_PORT}`);
  console.log(`📡 CORS Origin: ${process.env.CORS_ORIGIN}`);
  (async () => {
    try {
      const enabled = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
      if (enabled) {
        await initSchema();
        await startIndexer();
        startOrdinalSync();
      } else {
        console.log('⏸ Indexer deaktiviert. Überspringe DB-Init und Sync.');
      }
    } catch (e) {
      console.warn('Indexer init fehlgeschlagen:', e.message);
    }
  })();
});

export default app;
