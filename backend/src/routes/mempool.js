import express from 'express';
import rpcClient from '../services/rpcClient.js';

const router = express.Router();

// GET /api/mempool/info → basic mempool stats
router.get('/info', async (req, res) => {
  try {
    const info = await rpcClient.getMempoolInfo();
    res.json({ success: true, info });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/mempool/list?limit=1000&verbose=false → txids or verbose details
router.get('/list', async (req, res) => {
  try {
    const { limit = 1000, verbose = 'false' } = req.query;
    const verboseBool = String(verbose).toLowerCase() === 'true';

    let raw;
    if (verboseBool) {
      // call directly with verbose true
      raw = await rpcClient.call('getrawmempool', [true]);
    } else {
      raw = await rpcClient.getRawMempool();
    }

    if (!raw) return res.json({ success: true, items: [] });

    if (verboseBool && typeof raw === 'object' && !Array.isArray(raw)) {
      // Verbose: object keyed by txid; convert to array and slice
      const entries = Object.entries(raw).map(([txid, details]) => ({ txid, ...details }));
      const limited = entries.slice(0, Math.min(parseInt(limit, 10) || 1000, entries.length));
      return res.json({ success: true, items: limited, verbose: true, total: entries.length });
    }

    // Non-verbose: array of txids
    const arr = Array.isArray(raw) ? raw : [];
    const limited = arr.slice(0, Math.min(parseInt(limit, 10) || 1000, arr.length));
    return res.json({ success: true, items: limited, verbose: false, total: arr.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/mempool/tx/:txid → raw tx (verbose)
router.get('/tx/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    if (!/^[0-9a-fA-F]{64}$/.test(txid || '')) {
      return res.status(400).json({ success: false, error: 'Ungültige TXID' });
    }
    const tx = await rpcClient.getRawTransaction(txid, true);
    res.json({ success: true, txid, tx });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
 
// GET /api/mempool/entry/:txid → mempool metadata for a single tx
// Provides fee, size, time, ancestor/descendant counts, bip125 replaceable, etc.
router.get('/entry/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    if (!/^[0-9a-fA-F]{64}$/.test(txid || '')) {
      return res.status(400).json({ success: false, error: 'Ungültige TXID' });
    }
    try {
      const entry = await rpcClient.call('getmempoolentry', [txid]);
      return res.json({ success: true, txid, entry });
    } catch (e) {
      // If not in mempool, return 404 with a friendly message
      const msg = String(e.message || '');
      if (msg.toLowerCase().includes('not in mempool') || msg.toLowerCase().includes('missing inputs')) {
        return res.status(404).json({ success: false, error: 'Transaktion ist nicht im Mempool' });
      }
      throw e;
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});