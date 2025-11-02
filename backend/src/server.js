import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import walletRoutes from './routes/wallet.js';
import explorerRoutes from './routes/explorer.js';
import mempoolRoutes from './routes/mempool.js';
import ordinalsRoutes from './routes/ordinals-simple.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ordinalsB1T20Routes = require('./routes/ordinals-b1t20.cjs');
import rpcClient from './services/rpcClient.js';
import explorerClient from './services/explorerClient.js';
import { initSchema, getTipHeight } from './services/db.js';
import { startIndexer } from './indexer/indexer.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security Middleware
app.use(helmet());
// CORS: Erlaube mehrere Dev-Origins (3000, 3002) und lokale Netzwerke
const corsOriginEnv = process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3002';
const allowedOrigins = corsOriginEnv.split(',').map(s => s.trim()).filter(Boolean);
const CORS_VERBOSE = String(process.env.CORS_VERBOSE || 'false').toLowerCase() === 'true';
try { console.log('CORS Allowed Origins:', allowedOrigins); } catch {}
app.use(cors({
  origin: (origin, callback) => {
    if (CORS_VERBOSE) { try { console.log('CORS Check - Request Origin:', origin); } catch {} }
    // Nicht-Browser/gleiches Origin
    if (!origin) return callback(null, true);
    // Explizit erlaubte Origins aus ENV
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Vite Dev Server auf localhost beliebigen Ports zulassen
    if (/^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
    // Lokale Netzwerke (für Vite Preview) zulassen
    if (/^http:\/\/(127\.0\.0\.1|192\.168\.|172\.)\d*:\d+$/.test(origin)) return callback(null, true);
    if (CORS_VERBOSE) { try { console.warn('CORS blocked:', origin); } catch {} }
    return callback(null, false);
  },
  credentials: true
}));

// Rate Limiting (relaxed in development and for GET requests)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => {
    const isDev = String(process.env.NODE_ENV || '').toLowerCase() === 'development';
    // In development, skip limiting entirely
    if (isDev) return true;
    // Optionally skip GET endpoints in production if explicitly enabled
    const skipGet = String(process.env.RATE_LIMIT_SKIP_GET || 'false').toLowerCase() === 'true';
    if (skipGet && req.method === 'GET') return true;
    return false;
  }
});
app.use('/api/', limiter);

// Body Parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'B1T Wallet Backend',
    timestamp: new Date().toISOString()
  });
});

// Test RPC Connection
app.get('/api/test-connection', async (req, res) => {
  try {
    const info = await rpcClient.call('getblockchaininfo');

    // Explorer-Check deaktiviert, um unnötige Fehlerlogs zu vermeiden
    const explorerStatus = 'unknown';
    const explorerBlocks = 0;

    res.json({
      success: true,
      rpc: {
        chain: info.chain,
        blocks: info.blocks,
        headers: info.headers,
        status: 'online'
      },
      explorer: {
        status: explorerStatus,
        blocks: explorerBlocks,
        url: 'https://b1texplorer.com'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Indexer Status
app.get('/api/indexer-status', async (req, res) => {
  try {
    const enabled = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
    const startHeight = parseInt(process.env.INDEXER_START_HEIGHT || '0', 10);
    let dbTip = -1;
    let chainTip = 0;
    try { dbTip = await getTipHeight(); } catch {}
    try { chainTip = await rpcClient.getBlockCount(); } catch {}

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
app.use('/api/ordinals', ordinalsRoutes);
app.use('/api/ordinals/b1t20', ordinalsB1T20Routes);
const b1t20DirectDbRoutes = require('./routes/b1t20-direct-db.cjs');
app.use('/api/b1t20', b1t20DirectDbRoutes);

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
  // Initialize DB and start indexer in background if enabled
  (async () => {
    try {
      const enabled = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
      if (enabled) {
        await initSchema();
        await startIndexer();
      } else {
        console.log('⏸ Indexer deaktiviert. Überspringe DB-Init und Sync.');
      }
    } catch (e) {
      console.warn('Indexer init fehlgeschlagen:', e.message);
    }
  })();
});

export default app;

