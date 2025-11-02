import express from 'express';

const router = express.Router();

// Mock search
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 3 characters'
      });
    }

    // Return empty results - in production this would query RPC
    res.json({
      success: true,
      query: q,
      results: [],
      note: 'Mock search results - RPC integration temporarily disabled'
    });
  } catch (error) {
    console.error('Failed to search:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mock address details
router.get('/address/:address', (req, res) => {
  try {
    const { address } = req.params;

    if (!address || address.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format'
      });
    }

    // Return mock address data - in production this would query RPC
    res.json({
      success: true,
      address,
      balance: 0,
      unconfirmed: 0,
      transactions: [],
      note: 'Mock address data - RPC integration temporarily disabled'
    });
  } catch (error) {
    console.error('Failed to get address:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mock transaction details
router.get('/tx/:txid', (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid || txid.length !== 64) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID'
      });
    }

    // Return mock transaction data - in production this would query RPC
    res.json({
      success: false,
      error: 'Transaction not found',
      txid,
      note: 'Mock transaction data - RPC integration temporarily disabled'
    });
  } catch (error) {
    console.error('Failed to get transaction:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mock block details
router.get('/block/:hashOrHeight', (req, res) => {
  try {
    const { hashOrHeight } = req.params;

    // Return mock block data - in production this would query RPC
    res.json({
      success: false,
      error: 'Block not found',
      query: hashOrHeight,
      note: 'Mock block data - RPC integration temporarily disabled'
    });
  } catch (error) {
    console.error('Failed to get block:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;