import express from 'express';

const router = express.Router();

// Mock mempool info
router.get('/info', (req, res) => {
  try {
    // Return mock mempool info - in production this would query RPC
    res.json({
      success: true,
      size: 0,
      bytes: 0,
      usage: 0,
      maxmempool: 100000000,
      mempoolminfee: 1,
      maxmempool: 1000,
      note: 'Mock mempool data - RPC integration temporarily disabled'
    });
  } catch (error) {
    console.error('Failed to get mempool info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mock mempool list
router.get('/list', (req, res) => {
  try {
    const { limit = 500, verbose = false } = req.query;

    // Return empty mempool - in production this would query RPC
    res.json({
      success: true,
      transactions: [],
      total: 0,
      limit: parseInt(limit),
      verbose: verbose === 'true',
      note: 'Mock mempool list - RPC integration temporarily disabled'
    });
  } catch (error) {
    console.error('Failed to get mempool list:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mock mempool transaction
router.get('/tx/:txid', (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid || txid.length !== 64) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID'
      });
    }

    // Return empty response - in production this would query RPC
    res.json({
      success: false,
      error: 'Transaction not in mempool',
      txid,
      note: 'Mock mempool data - RPC integration temporarily disabled'
    });
  } catch (error) {
    console.error('Failed to get mempool tx:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mock mempool entry
router.get('/entry/:txid', (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid || txid.length !== 64) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID'
      });
    }

    // Return empty entry - in production this would query RPC
    res.json({
      success: false,
      error: 'Transaction not in mempool',
      txid,
      note: 'Mock mempool data - RPC integration temporarily disabled'
    });
  } catch (error) {
    console.error('Failed to get mempool entry:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;