import express from 'express';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import rpcClient from '../services/rpcClient.js';
import dbWallet from '../services/dbWallet.js';
import { createInscription, estimateInscriptionCost } from '../services/inscriptionService.js';
import { getPool } from '../services/db.js';

const router = express.Router();
const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

const B1T_NETWORK = {
  messagePrefix: '\x18Bit Signed Message:\n',
  bech32: 'bc',
  bip32: { public: 0x02FACAFD, private: 0x02FAC398 },
  pubKeyHash: 0x19,
  scriptHash: 0x16,
  wif: 0x9E,
};
const B1T_COIN_TYPE = 3141;

function deriveWIF(mnemonic, addressIndex) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, B1T_NETWORK);
  const path = `m/44'/${B1T_COIN_TYPE}'/0'/0/${addressIndex}`;
  const child = root.derivePath(path);
  const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: B1T_NETWORK });
  return keyPair.toWIF();
}

function deriveAddress(mnemonic, addressIndex) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, B1T_NETWORK);
  const path = `m/44'/${B1T_COIN_TYPE}'/0'/0/${addressIndex}`;
  const child = root.derivePath(path);
  const { address } = bitcoin.payments.p2pkh({ pubkey: child.publicKey, network: B1T_NETWORK });
  return address;
}

function getScriptPubKey(address) {
  return bitcoin.address.toOutputScript(address, B1T_NETWORK).toString('hex');
}

/**
 * POST /api/ordinals/inscribe
 * Create and broadcast an inscription.
 */
router.post('/inscribe', async (req, res) => {
  try {
    const { mnemonic, addressIndex = 0, toAddress, contentType, hexData, mintAddress, mintPrice } = req.body;

    if (!mnemonic || !contentType || !hexData) {
      return res.status(400).json({ success: false, error: 'mnemonic, contentType and hexData are required' });
    }

    if (!bip39.validateMnemonic(mnemonic)) {
      return res.status(400).json({ success: false, error: 'Invalid mnemonic' });
    }

    if (!/^[a-fA-F0-9]*$/.test(hexData)) {
      return res.status(400).json({ success: false, error: 'hexData must be a valid hex string' });
    }

    const data = Buffer.from(hexData, 'hex');
    if (data.length === 0) {
      return res.status(400).json({ success: false, error: 'No data to inscribe' });
    }

    if (data.length > 400 * 1024) {
      return res.status(400).json({ success: false, error: 'Data too large (max 400 KB)' });
    }

    const senderAddress = deriveAddress(mnemonic, addressIndex);
    const destination = toAddress || senderAddress;
    const wif = deriveWIF(mnemonic, addressIndex);
    const scriptHex = getScriptPubKey(senderAddress);

    // Load UTXOs from DB indexer (primary) or RPC (fallback)
    const useIndexer = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
    let rawUtxos = [];
    if (useIndexer) {
      try {
        rawUtxos = await dbWallet.getAddressUtxos(senderAddress);
      } catch (e) {
        console.warn('DB UTXO fetch failed, trying RPC:', e.message);
      }
    }
    if (rawUtxos.length === 0) {
      try {
        rawUtxos = await rpcClient.getAddressUtxos(senderAddress);
      } catch (e) {
        console.warn('RPC UTXO fetch also failed:', e.message);
      }
    }

    if (!rawUtxos || rawUtxos.length === 0) {
      return res.status(400).json({ success: false, error: 'No UTXOs available for this address' });
    }

    // Convert to bitcore-lib-b1t format
    const utxos = rawUtxos.map(u => ({
      txid: u.txid,
      vout: u.outputIndex !== undefined ? u.outputIndex : (u.vout !== undefined ? u.vout : 0),
      script: u.script || u.scriptPubKey || scriptHex,
      satoshis: Number(u.satoshis || u.value || 0)
    }));

    // Sort by satoshis descending so largest UTXO is used first
    utxos.sort((a, b) => b.satoshis - a.satoshis);

    console.log(`Inscribing ${data.length} bytes (${contentType}) from ${senderAddress} to ${destination}, ${utxos.length} UTXOs available`);

    const pendingTransactions = createInscription(
      wif,
      senderAddress,
      destination,
      contentType,
      data,
      utxos,
      mintAddress || null,
      mintPrice ? parseInt(mintPrice) : null
    );

    // Broadcast all transactions sequentially
    const broadcastResults = [];
    for (const ptx of pendingTransactions) {
      try {
        const txid = await rpcClient.sendRawTransaction(ptx.hex);
        broadcastResults.push({ transactionNumber: ptx.transactionNumber, txid, status: 'broadcast' });
        console.log(`  Tx ${ptx.transactionNumber}/${pendingTransactions.length} broadcast: ${txid}`);
      } catch (e) {
        broadcastResults.push({ transactionNumber: ptx.transactionNumber, txid: ptx.txid, status: 'failed', error: e.message });
        console.error(`  Tx ${ptx.transactionNumber} broadcast failed:`, e.message);
        return res.status(500).json({
          success: false,
          error: `Transaction ${ptx.transactionNumber} broadcast failed: ${e.message}`,
          broadcastResults,
          totalTransactions: pendingTransactions.length,
        });
      }
    }

    const lastTxid = broadcastResults[broadcastResults.length - 1]?.txid;

    // Store inscription metadata + content in DB
    try {
      await getPool().query(
        `INSERT INTO inscriptions (inscription_txid, owner_address, to_address, content_type, data_size, content, total_transactions, created_at, utxo_txid, utxo_vout)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (inscription_txid) DO NOTHING`,
        [lastTxid, senderAddress, destination, contentType, data.length, data, pendingTransactions.length, Math.floor(Date.now() / 1000), lastTxid, 0]
      );
    } catch (dbErr) {
      console.warn('Failed to store inscription metadata:', dbErr.message);
    }

    res.json({
      success: true,
      inscriptionTxid: lastTxid,
      totalTransactions: pendingTransactions.length,
      broadcastResults,
      from: senderAddress,
      to: destination,
      contentType,
      dataSize: data.length,
    });
  } catch (error) {
    console.error('Inscription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ordinals/estimate
 * Estimate inscription cost without broadcasting.
 */
router.post('/estimate', (req, res) => {
  try {
    const { dataSize } = req.body;
    if (!dataSize || dataSize <= 0) {
      return res.status(400).json({ success: false, error: 'dataSize must be a positive number' });
    }
    const estimate = estimateInscriptionCost(dataSize);
    res.json({ success: true, ...estimate });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ordinals/broadcast-chain
 * Broadcast an array of pre-built transaction hexes in sequence.
 */
router.post('/broadcast-chain', async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ success: false, error: 'transactions array required' });
    }

    const results = [];
    for (let i = 0; i < transactions.length; i++) {
      const hex = transactions[i];
      try {
        const txid = await rpcClient.sendRawTransaction(hex);
        results.push({ index: i, txid, status: 'broadcast' });
      } catch (e) {
        results.push({ index: i, status: 'failed', error: e.message });
        return res.status(500).json({
          success: false,
          error: `Transaction ${i + 1} failed: ${e.message}`,
          results,
        });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ordinals/address/:address/inscriptions
 * List inscriptions owned by or sent to an address.
 */
router.get('/address/:address/inscriptions', async (req, res) => {
  try {
    const { address } = req.params;
    const { rows } = await getPool().query(
      `SELECT inscription_txid, owner_address, to_address, content_type, data_size, total_transactions, created_at, utxo_txid, utxo_vout
       FROM inscriptions
       WHERE owner_address = $1 OR to_address = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [address]
    );
    res.json({ success: true, inscriptions: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ordinals/content/:txid
 * Serve the raw inscription content (image/data).
 */
router.get('/content/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    const { rows } = await getPool().query(
      'SELECT content_type, content FROM inscriptions WHERE inscription_txid = $1',
      [txid]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inscription not found' });
    }
    const { content_type, content } = rows[0];
    if (!content) {
      return res.status(404).json({ success: false, error: 'No content stored' });
    }
    res.set('Content-Type', content_type);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(content);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ordinals/address/:address/tokens
 * Placeholder for token balances (requires ordinals indexer).
 */
router.get('/address/:address/tokens', async (req, res) => {
  try {
    res.json({ success: true, tokens: [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ordinals/transfer
 * Transfer an inscription (ordinal) to another address.
 */
router.post('/transfer', async (req, res) => {
  try {
    const { mnemonic, addressIndex = 0, inscriptionTxid, toAddress } = req.body;

    if (!mnemonic || !inscriptionTxid || !toAddress) {
      return res.status(400).json({ success: false, error: 'mnemonic, inscriptionTxid and toAddress are required' });
    }

    if (!bip39.validateMnemonic(mnemonic)) {
      return res.status(400).json({ success: false, error: 'Invalid mnemonic' });
    }

    const senderAddress = deriveAddress(mnemonic, addressIndex);
    const wif = deriveWIF(mnemonic, addressIndex);

    // Find the inscription UTXO (output 0 of the inscription tx should hold the ordinal)
    const { rows: inscRows } = await getPool().query(
      'SELECT utxo_txid, utxo_vout, content_type, data_size FROM inscriptions WHERE inscription_txid = $1',
      [inscriptionTxid]
    );
    if (inscRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inscription not found in database' });
    }

    const insc = inscRows[0];
    const scriptHex = getScriptPubKey(senderAddress);

    // Get the UTXO value from the inscription tx output
    let utxoSatoshis = 100000; // Default inscription output
    try {
      const rawTx = await rpcClient.call('getrawtransaction', [insc.utxo_txid, true]);
      if (rawTx && rawTx.vout && rawTx.vout[insc.utxo_vout]) {
        utxoSatoshis = Math.round(rawTx.vout[insc.utxo_vout].value * 100000000);
      }
    } catch {}

    // Load a funding UTXO for the fee
    const useIndexer = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
    let rawUtxos = [];
    if (useIndexer) {
      try { rawUtxos = await dbWallet.getAddressUtxos(senderAddress); } catch {}
    }
    if (rawUtxos.length === 0) {
      try { rawUtxos = await rpcClient.getAddressUtxos(senderAddress); } catch {}
    }

    // Build a simple transfer transaction using bitcore-lib-b1t
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const dogecore = require('../lib/bitcore-lib-b1t');
    const { Transaction: BTransaction, PrivateKey: BPrivateKey } = dogecore;

    BTransaction.FEE_PER_KB = parseInt(process.env.FEE_PER_KB || '5625000');
    const MIN_FEE = 2000000;

    const tx = new BTransaction();

    // Add the inscription UTXO as first input (preserves ordinal)
    tx.from({
      txid: insc.utxo_txid,
      vout: insc.utxo_vout,
      script: scriptHex,
      satoshis: utxoSatoshis
    });

    // Send inscription amount to destination (first output = ordinal)
    tx.to(toAddress, utxoSatoshis);

    // Add a funding UTXO for the fee
    const fundingUtxos = rawUtxos
      .filter(u => !(u.txid === insc.utxo_txid && (u.outputIndex || u.vout || 0) === insc.utxo_vout))
      .map(u => ({
        txid: u.txid,
        vout: u.outputIndex !== undefined ? u.outputIndex : (u.vout !== undefined ? u.vout : 0),
        script: u.script || u.scriptPubKey || scriptHex,
        satoshis: Number(u.satoshis || u.value || 0)
      }))
      .sort((a, b) => b.satoshis - a.satoshis);

    if (fundingUtxos.length > 0) {
      tx.from(fundingUtxos[0]);
    }

    tx.change(senderAddress);
    const fee = Math.max(tx.getFee ? tx.getFee() : MIN_FEE, MIN_FEE);
    tx.fee(fee);
    tx.sign(wif);

    const txid = await rpcClient.sendRawTransaction(tx.toString());

    // Update inscription ownership in DB
    try {
      await getPool().query(
        `UPDATE inscriptions SET to_address = $1, utxo_txid = $2, utxo_vout = 0 WHERE inscription_txid = $3`,
        [toAddress, txid, inscriptionTxid]
      );
    } catch {}

    console.log(`Inscription ${inscriptionTxid} transferred to ${toAddress}, new txid: ${txid}`);

    res.json({
      success: true,
      txid,
      from: senderAddress,
      to: toAddress,
      inscriptionTxid,
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
