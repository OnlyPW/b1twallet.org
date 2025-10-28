import express from 'express';
import rpcClient from '../services/rpcClient.js';
import explorerClient from '../services/explorerClient.js';

const router = express.Router();

function isHex64(str) {
  return /^[0-9a-fA-F]{64}$/.test(str || '');
}

function isNumber(str) {
  return /^\d{1,9}$/.test(String(str || ''));
}

// Address summary
router.get('/address/:address', async (req, res) => {
  const { address } = req.params;
  try {
    // Validate address via RPC
    const validation = await rpcClient.validateAddress(address);
    if (!validation?.isvalid) {
      return res.status(400).json({ success: false, error: 'Ungültige Adresse' });
    }

    // Balance via explorer (fallbacks inside service)
    const balance = await rpcClient.getAddressBalance(address);
    const txs = await explorerClient.getAddressTransactionsDetailed(address, 0, 50);

    res.json({ success: true, type: 'address', address, balance, transactions: txs, count: txs.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Transaction details
router.get('/tx/:txid', async (req, res) => {
  const { txid } = req.params;
  try {
    if (!isHex64(txid)) {
      return res.status(400).json({ success: false, error: 'Ungültige TXID' });
    }

    let tx;
    try {
      tx = await explorerClient.getTransaction(txid);
    } catch (e) {
      // Fallback RPC
      tx = await rpcClient.call('getrawtransaction', [txid, true]);
    }

    res.json({ success: true, type: 'tx', txid, tx });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Block details (by height or hash)
router.get('/block/:hashOrHeight', async (req, res) => {
  const { hashOrHeight } = req.params;
  try {
    let blockHash = hashOrHeight;
    if (isNumber(hashOrHeight)) {
      blockHash = await rpcClient.call('getblockhash', [parseInt(hashOrHeight, 10)]);
    } else if (!isHex64(hashOrHeight)) {
      return res.status(400).json({ success: false, error: 'Ungültiger Block-Hash/Height' });
    }

    const block = await rpcClient.call('getblock', [blockHash, 2]);
    res.json({ success: true, type: 'block', block });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search endpoint: detect address, txid, or block
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ success: false, error: 'Query fehlt' });

  try {
    // Address?
    try {
      const v = await rpcClient.validateAddress(q);
      if (v?.isvalid) {
        const balance = await rpcClient.getAddressBalance(q);
        const txs = await explorerClient.getAddressTransactionsDetailed(q, 0, 25);
        return res.json({ success: true, type: 'address', address: q, balance, transactions: txs, count: txs.length });
      }
    } catch {}

    // Txid?
    if (isHex64(q)) {
      try {
        const tx = await explorerClient.getTransaction(q);
        return res.json({ success: true, type: 'tx', txid: q, tx });
      } catch {}
      try {
        const tx = await rpcClient.call('getrawtransaction', [q, true]);
        return res.json({ success: true, type: 'tx', txid: q, tx });
      } catch {}
    }

    // Block height/hash?
    try {
      let hash = q;
      if (isNumber(q)) {
        hash = await rpcClient.call('getblockhash', [parseInt(q, 10)]);
      }
      if (isHex64(hash)) {
        const block = await rpcClient.call('getblock', [hash, 2]);
        return res.json({ success: true, type: 'block', block });
      }
    } catch {}

    return res.status(404).json({ success: false, type: 'unknown', error: 'Nicht gefunden' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;