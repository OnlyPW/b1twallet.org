import express from 'express';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';

const router = express.Router();
const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

// B1T Network Parameters
const B1T_NETWORK = {
  messagePrefix: '\x18Bit Signed Message:\n',
  bech32: 'bc',
  bip32: {
    public: 0x04b24746,
    private: 0x04b2430c,
  },
  pubKeyHash: 0x19,
  scriptHash: 0x5c,
  wif: 0x99
};

// Temporarily disable RPC to allow wallet functionality
const MOCK_MODE = true;

// Mock RPC client for development
const mockRpcClient = {
  call: async (method, params = []) => {
    if (MOCK_MODE) {
      console.log(`Mock RPC call: ${method}(${params.join(', ')})`);

      // Mock responses for common methods
      switch (method) {
        case 'getblockchaininfo':
          return {
            chain: 'main',
            blocks: 151000,
            headers: 151000,
            difficulty: 1,
            size: 2000000000
          };
        case 'getblockcount':
          return 151000;
        case 'getbalance':
          return 0;
        case 'listunspent':
          return [];
        case 'sendtoaddress':
          return 'mock-txid-' + Math.random().toString(36).substring(7);
        case 'estimatesmartfee':
          return { feerate: 0.00001, blocks: params[0] || 6 };
        case 'getrawtransaction':
          return {
            txid: 'mock-txid',
            version: 1,
            locktime: 0,
            size: 191,
            vsize: 191,
            weight: 764,
            fee: 10236,
            vin: [],
            vout: [],
            blockhash: null,
            confirmations: 0,
            time: Math.floor(Date.now() / 1000),
            blocktime: Math.floor(Date.now() / 1000)
          };
        default:
          return null;
      }
    }

    // If not in mock mode, would call real RPC here
    throw new Error('RPC temporarily disabled');
  }
};

// Generate mnemonic
router.post('/generate-mnemonic', (req, res) => {
  try {
    const { strength = 128 } = req.body;
    const mnemonic = bip39.generateMnemonic(strength);
    res.json({
      success: true,
      mnemonic
    });
  } catch (error) {
    console.error('Failed to generate mnemonic:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Validate mnemonic
router.post('/validate-mnemonic', (req, res) => {
  try {
    const { mnemonic } = req.body;
    const valid = bip39.validateMnemonic(mnemonic);
    res.json({
      success: true,
      valid
    });
  } catch (error) {
    console.error('Failed to validate mnemonic:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Derive XPUB
router.post('/derive-xpub', (req, res) => {
  try {
    const { mnemonic, account = 0 } = req.body;
    if (!mnemonic) {
      return res.status(400).json({
        success: false,
        error: 'Mnemonic is required'
      });
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed);
    const path = `m/44'/3141'/0'/0'`;
    const accountNode = root.derivePath(path);
    const xpub = accountNode.toBase58();

    res.json({
      success: true,
      xpub,
      path
    });
  } catch (error) {
    console.error('Failed to derive xpub:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Derive address
router.post('/derive-address', (req, res) => {
  try {
    const { mnemonic, index = 0, change = 0 } = req.body;
    if (!mnemonic) {
      return res.status(400).json({
        success: false,
        error: 'Mnemonic is required'
      });
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed);
    const path = `m/44'/3141'/0'/${change}/${index}`;
    const child = root.derivePath(path);
    const address = bitcoin.payments.p2pkh({
      pubkey: child.publicKey,
      network: {
        ...bitcoin.networks.bitcoin,
        bip32: B1T_NETWORK.bip32,
        pubKeyHash: B1T_NETWORK.pubKeyHash,
        scriptHash: B1T_NETWORK.scriptHash,
        wif: B1T_NETWORK.wif,
      }
    }).address;

    res.json({
      success: true,
      address,
      path,
      publicKey: child.publicKey.toString('hex')
    });
  } catch (error) {
    console.error('Failed to derive address:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Derive addresses (multiple)
router.post('/derive-addresses', (req, res) => {
  try {
    const { mnemonic, count = 5, change = 0, startIndex = 0 } = req.body;
    if (!mnemonic) {
      return res.status(400).json({
        success: false,
        error: 'Mnemonic is required'
      });
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed);
    const addresses = [];

    for (let i = 0; i < count; i++) {
      const index = startIndex + i;
      const path = `m/44'/3141'/0'/${change}/${index}`;
      const child = root.derivePath(path);
      const address = bitcoin.payments.p2pkh({
        pubkey: child.publicKey,
        network: {
          ...bitcoin.networks.bitcoin,
          bip32: B1T_NETWORK.bip32,
          pubKeyHash: B1T_NETWORK.pubKeyHash,
          scriptHash: B1T_NETWORK.scriptHash,
          wif: B1T_NETWORK.wif,
        }
      }).address;

      addresses.push({
        address,
        path,
        index,
        publicKey: child.publicKey.toString('hex')
      });
    }

    res.json({
      success: true,
      addresses
    });
  } catch (error) {
    console.error('Failed to derive addresses:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get balance
router.get('/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (MOCK_MODE) {
      // Return mock balance
      res.json({
        success: true,
        address,
        balance: 0,
        unconfirmed: 0,
        note: 'Mock balance - RPC connection temporarily disabled'
      });
      return;
    }

    // Would call real RPC here when available
    const balance = await mockRpcClient.call('getbalance', [address]);
    res.json({
      success: true,
      address,
      balance,
      unconfirmed: 0
    });
  } catch (error) {
    console.error('Failed to get balance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get UTXOs
router.get('/utxos/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (MOCK_MODE) {
      res.json({
        success: true,
        address,
        utxos: [],
        note: 'Mock UTXOs - RPC connection temporarily disabled'
      });
      return;
    }

    const utxos = await mockRpcClient.call('listunspent', [0, 9999999, [address]]);
    const formattedUtxos = utxos.map(utxo => ({
      txid: utxo.txid,
      outputIndex: utxo.vout,
      satoshis: Math.round(utxo.amount * 100000000),
      scriptPubKey: utxo.scriptPubKey,
      address: address
    }));

    res.json({
      success: true,
      address,
      utxos: formattedUtxos
    });
  } catch (error) {
    console.error('Failed to get UTXOs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get transactions
router.get('/transactions/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { start = 0, limit = 10 } = req.query;

    if (MOCK_MODE) {
      res.json({
        success: true,
        address,
        transactions: [],
        total: 0,
        start,
        limit,
        note: 'Mock transactions - RPC connection temporarily disabled'
      });
      return;
    }

    // Mock for now - would implement real transaction fetching
    res.json({
      success: true,
      address,
      transactions: [],
      total: 0,
      start,
      limit
    });
  } catch (error) {
    console.error('Failed to get transactions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get live balance
router.get('/live-balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 1000 } = req.query;

    if (MOCK_MODE) {
      res.json({
        success: true,
        address,
        balance: 0,
        unconfirmed: 0,
        utxos: [],
        transactions: [],
        note: 'Mock live balance - RPC connection temporarily disabled'
      });
      return;
    }

    const balance = await mockRpcClient.call('getbalance', [address]);
    const utxos = await mockRpcClient.call('listunspent', [0, 9999999, [address]]);

    res.json({
      success: true,
      address,
      balance,
      unconfirmed: 0,
      utxos: utxos.map(utxo => ({
        txid: utxo.txid,
        outputIndex: utxo.vout,
        satoshis: Math.round(utxo.amount * 100000000)
      }))
    });
  } catch (error) {
    console.error('Failed to get live balance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Estimate fee
router.get('/estimate-fee', async (req, res) => {
  try {
    const { blocks = 6 } = req.query;

    if (MOCK_MODE) {
      res.json({
        success: true,
        blocks: parseInt(blocks),
        feeRate: 1000,
        satPerByte: 1000,
        note: 'Mock fee estimate - RPC connection temporarily disabled'
      });
      return;
    }

    const feeInfo = await mockRpcClient.call('estimatesmartfee', [parseInt(blocks)]);
    const satPerByte = Math.ceil(feeInfo.feerate * 100000 / 1000);

    res.json({
      success: true,
      blocks: parseInt(blocks),
      feeRate: feeInfo.feerate,
      satPerByte: Math.max(1, satPerByte)
    });
  } catch (error) {
    console.error('Failed to estimate fee:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send transaction - simplified without RPC
router.post('/send', async (req, res) => {
  try {
    const { toAddress, amount, feeRate } = req.body;

    if (!toAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'To address and amount are required'
      });
    }

    if (MOCK_MODE) {
      // Return mock transaction
      const mockTxid = 'mock-txid-' + Math.random().toString(36).substring(7);

      res.json({
        success: false,
        error: 'Transaction sending temporarily disabled',
        message: 'RPC connection temporarily disabled. Transaction prepared but not broadcast.',
        mockTransaction: {
          txid: mockTxid,
          toAddress,
          amount,
          feeRate: feeRate || 1000,
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    // Would implement real transaction creation here
    res.json({
      success: false,
      error: 'Transaction sending not implemented'
    });
  } catch (error) {
    console.error('Failed to send transaction:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;