import express from 'express';
import * as bitcoin from 'bitcoinjs-lib';
import rpcClient from '../services/rpcClient.js';
import dbWallet from '../services/dbWallet.js';
import { createInscription, estimateInscriptionCost } from '../services/inscriptionService.js';
import { getPool } from '../services/db.js';

const router = express.Router();

const B1T_NETWORK = {
  messagePrefix: '\x18Bit Signed Message:\n',
  bech32: 'bc',
  bip32: { public: 0x02FACAFD, private: 0x02FAC398 },
  pubKeyHash: 0x19,
  scriptHash: 0x16,
  wif: 0x9E,
};

const MAX_MEMPOOL_CHAIN = 20;
const CONFIRMATION_POLL_INTERVAL = 5000;
const CONFIRMATION_TIMEOUT = 300000;

function getScriptPubKey(address) {
  return bitcoin.address.toOutputScript(address, B1T_NETWORK).toString('hex');
}

async function waitForConfirmation(txid, pollInterval = CONFIRMATION_POLL_INTERVAL, timeout = CONFIRMATION_TIMEOUT, onCheck = null) {
  const startTime = Date.now();
  let checkCount = 0;
  while (Date.now() - startTime < timeout) {
    checkCount++;
    try {
      const tx = await rpcClient.call('getrawtransaction', [txid, true]);
      if (tx && tx.confirmations && tx.confirmations > 0) {
        return true;
      }
    } catch (e) {
      // TX might not be in mempool anymore or other error
    }
    if (onCheck) onCheck(checkCount);
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  throw new Error(`Timeout waiting for confirmation of ${txid}`);
}

/**
 * POST /api/ordinals/inscribe
 * Create and broadcast an inscription.
 */
router.post('/inscribe', async (req, res) => {
  try {
    const { wif, senderAddress, toAddress, contentType, hexData, mintAddress, mintPrice, stream } = req.body;

    if (!wif || !senderAddress || !contentType || !hexData) {
      return res.status(400).json({ success: false, error: 'wif, senderAddress, contentType and hexData are required' });
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

    const useStream = stream === true;
    if (useStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
    }

    const sendEvent = (event, data) => {
      if (useStream) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    const destination = toAddress || senderAddress;
    const scriptHex = getScriptPubKey(senderAddress);

    sendEvent('progress', { step: 'preparing', message: 'Lade UTXOs...', progress: 5 });

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
      sendEvent('error', { error: 'No UTXOs available for this address' });
      return res.status(400).json({ success: false, error: 'No UTXOs available for this address' });
    }

    const utxos = rawUtxos.map(u => ({
      txid: u.txid,
      vout: u.outputIndex !== undefined ? u.outputIndex : (u.vout !== undefined ? u.vout : 0),
      script: u.script || u.scriptPubKey || scriptHex,
      satoshis: Number(u.satoshis || u.value || 0)
    }));
    utxos.sort((a, b) => b.satoshis - a.satoshis);

    sendEvent('progress', { step: 'building', message: 'Erstelle Transaktionen...', progress: 10 });

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

    const totalTx = pendingTransactions.length;
    const needsBatching = totalTx > MAX_MEMPOOL_CHAIN;
    const batchCount = needsBatching ? Math.ceil(totalTx / MAX_MEMPOOL_CHAIN) : 1;

    sendEvent('info', {
      totalTransactions: totalTx,
      needsBatching,
      batchCount,
      maxPerBatch: MAX_MEMPOOL_CHAIN
    });

    if (needsBatching) {
      console.log(`Large inscription: ${totalTx} transactions, splitting into ${batchCount} batches (max ${MAX_MEMPOOL_CHAIN} per batch)`);
    }

    const broadcastResults = [];
    let lastBatchTxid = null;

    for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
      const batchStart = batchIndex * MAX_MEMPOOL_CHAIN;
      const batchEnd = Math.min(batchStart + MAX_MEMPOOL_CHAIN, totalTx);
      const batchTxs = pendingTransactions.slice(batchStart, batchEnd);

      if (needsBatching) {
        sendEvent('progress', {
          step: 'batch',
          message: `Batch ${batchIndex + 1}/${batchCount}`,
          batch: batchIndex + 1,
          totalBatches: batchCount,
          info: {
            totalTransactions: totalTx,
            batchCount: batchCount,
            currentBatch: batchIndex + 1
          },
          progress: 10 + Math.round((batchIndex / batchCount) * 70)
        });
        console.log(`Batch ${batchIndex + 1}/${batchCount}: Broadcasting transactions ${batchStart + 1}-${batchEnd}`);
      }

      for (let i = 0; i < batchTxs.length; i++) {
        const ptx = batchTxs[i];
        const txProgress = 10 + Math.round(((batchIndex * MAX_MEMPOOL_CHAIN + i + 1) / totalTx) * 70);

        sendEvent('progress', {
          step: 'broadcast',
          message: `Sende TX ${batchStart + i + 1}/${totalTx}`,
          currentTx: batchStart + i + 1,
          totalTx,
          batch: batchIndex + 1,
          totalBatches: batchCount,
          info: {
            totalTransactions: totalTx,
            batchCount: batchCount,
            currentBatch: batchIndex + 1,
            currentTx: batchStart + i + 1
          },
          progress: txProgress
        });

        try {
          const txid = await rpcClient.sendRawTransaction(ptx.hex);
          broadcastResults.push({ transactionNumber: ptx.transactionNumber, txid, status: 'broadcast' });
          console.log(`  Tx ${ptx.transactionNumber}/${totalTx} broadcast: ${txid}`);
          lastBatchTxid = txid;
        } catch (e) {
          broadcastResults.push({ transactionNumber: ptx.transactionNumber, txid: ptx.txid, status: 'failed', error: e.message });
          console.error(`  Tx ${ptx.transactionNumber} broadcast failed:`, e.message);
          sendEvent('error', {
            error: `Transaction ${ptx.transactionNumber} broadcast failed: ${e.message}`,
            broadcastResults,
            batchInfo: needsBatching ? { currentBatch: batchIndex + 1, totalBatches: batchCount } : null
          });
          return res.status(500).json({
            success: false,
            error: `Transaction ${ptx.transactionNumber} broadcast failed: ${e.message}`,
            broadcastResults,
            totalTransactions: totalTx,
            batchInfo: needsBatching ? { currentBatch: batchIndex + 1, totalBatches: batchCount } : null,
          });
        }
      }

      if (batchIndex < batchCount - 1 && lastBatchTxid) {
        sendEvent('progress', {
          step: 'waiting',
          message: `Warte auf Block-Bestätigung...`,
          waitingFor: lastBatchTxid,
          batch: batchIndex + 1,
          totalBatches: batchCount,
          info: {
            totalTransactions: totalTx,
            batchCount: batchCount,
            currentBatch: batchIndex + 1,
            waitingForBlock: true
          },
          progress: 80
        });
        console.log(`Batch ${batchIndex + 1}/${batchCount} complete. Waiting for 1 confirmation before continuing...`);
        try {
          await waitForConfirmation(lastBatchTxid, CONFIRMATION_POLL_INTERVAL, CONFIRMATION_TIMEOUT, (checkCount) => {
            sendEvent('progress', {
              step: 'waiting',
              message: `Prüfe Bestätigung (Versuch ${checkCount})...`,
              waitingFor: lastBatchTxid,
              batch: batchIndex + 1,
              totalBatches: batchCount,
              info: {
                totalTransactions: totalTx,
                batchCount: batchCount,
                currentBatch: batchIndex + 1,
                waitingForBlock: true,
                checkCount: checkCount
              },
              progress: 80 + Math.min(checkCount * 2, 15)
            });
          });
          console.log(`Confirmation received. Continuing with batch ${batchIndex + 2}...`);
        } catch (waitErr) {
          console.error(`Timeout waiting for confirmation:`, waitErr.message);
          sendEvent('error', {
            error: `Timeout waiting for block confirmation between batches: ${waitErr.message}`,
            broadcastResults,
            batchInfo: { currentBatch: batchIndex + 1, totalBatches: batchCount, waitingForConfirmation: lastBatchTxid }
          });
          return res.status(500).json({
            success: false,
            error: `Timeout waiting for block confirmation between batches: ${waitErr.message}`,
            broadcastResults,
            totalTransactions: totalTx,
            batchInfo: { currentBatch: batchIndex + 1, totalBatches: batchCount, waitingForConfirmation: lastBatchTxid },
          });
        }
      }
    }

    const lastTxid = broadcastResults[broadcastResults.length - 1]?.txid;

    sendEvent('progress', { step: 'saving', message: 'Speichere Inscription...', progress: 95 });

    try {
      await getPool().query(
        `INSERT INTO inscriptions (inscription_txid, owner_address, to_address, content_type, data_size, content, total_transactions, created_at, utxo_txid, utxo_vout, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'created')
         ON CONFLICT (inscription_txid) DO NOTHING`,
        [lastTxid, senderAddress, destination, contentType, data.length, data, pendingTransactions.length, Math.floor(Date.now() / 1000), lastTxid, 0]
      );
    } catch (dbErr) {
      console.warn('Failed to store inscription metadata:', dbErr.message);
    }

    sendEvent('complete', {
      success: true,
      inscriptionTxid: lastTxid,
      totalTransactions: pendingTransactions.length,
      broadcastResults,
      from: senderAddress,
      to: destination,
      contentType,
      dataSize: data.length,
      batchInfo: needsBatching ? { totalBatches: batchCount, transactionsPerBatch: MAX_MEMPOOL_CHAIN } : null,
      info: {
        totalTransactions: pendingTransactions.length,
        batchCount: needsBatching ? batchCount : 1,
        dataSize: data.length
      },
      step: 'complete',
      message: 'Inscription completed successfully!',
      progress: 100
    });

    if (useStream) {
      res.end();
      return;
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
      batchInfo: needsBatching ? { totalBatches: batchCount, transactionsPerBatch: MAX_MEMPOOL_CHAIN } : null,
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
 * Includes both created and received ordinals.
 */
router.get('/address/:address/inscriptions', async (req, res) => {
  try {
    const { address } = req.params;
    const { rows } = await getPool().query(
      `SELECT inscription_txid, owner_address, to_address, content_type, data_size, total_transactions, created_at, utxo_txid, utxo_vout, source, ord_id, genesis_height
       FROM inscriptions
       WHERE owner_address = $1 OR to_address = $1
       ORDER BY COALESCE(created_at, synced_at) DESC
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
 * For locally created inscriptions, serves from DB.
 * For received inscriptions, proxies from ord-indexer.
 */
router.get('/content/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    const { rows } = await getPool().query(
      'SELECT content_type, content, ord_id, source FROM inscriptions WHERE inscription_txid = $1 OR ord_id = $1',
      [txid]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inscription not found' });
    }
    const { content_type, content, ord_id, source } = rows[0];
    
    if (content && content.length > 0) {
      res.set('Content-Type', content_type || 'application/octet-stream');
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(content);
    }
    
    if ((source === 'received' || !content) && ord_id) {
      const fetch = (await import('node-fetch')).default;
      try {
        const upstream = await fetch(`${ORD_URL}/content/${encodeURIComponent(ord_id)}`, { timeout: 15000 });
        if (!upstream.ok) {
          return res.status(upstream.status).json({ success: false, error: 'Content not available from indexer' });
        }
        const ct = upstream.headers.get('content-type') || content_type || 'application/octet-stream';
        res.set('Content-Type', ct);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        return upstream.body.pipe(res);
      } catch (proxyErr) {
        return res.status(502).json({ success: false, error: 'Failed to fetch content from indexer: ' + proxyErr.message });
      }
    }
    
    res.status(404).json({ success: false, error: 'No content stored' });
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
 * Works for both created and received ordinals.
 */
router.post('/transfer', async (req, res) => {
  try {
    const { wif, senderAddress, inscriptionTxid, toAddress } = req.body;

    if (!wif || !senderAddress || !inscriptionTxid || !toAddress) {
      return res.status(400).json({ success: false, error: 'wif, senderAddress, inscriptionTxid and toAddress are required' });
    }

    // Find the inscription - support both txid and ord_id lookup
    const { rows: inscRows } = await getPool().query(
      'SELECT utxo_txid, utxo_vout, content_type, data_size, ord_id, source FROM inscriptions WHERE inscription_txid = $1 OR ord_id = $1',
      [inscriptionTxid]
    );
    if (inscRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inscription not found in database' });
    }

    let insc = inscRows[0];
    
    // For received ordinals, fetch current UTXO from ord-indexer
    if (insc.source === 'received' && insc.ord_id) {
      try {
        const ordData = await ordFetch(`/inscription/${encodeURIComponent(insc.ord_id)}?json=true`);
        const info = (ordData?.inscription && typeof ordData.inscription === 'object') ? ordData.inscription : ordData;
        
        // Update with current location if available
        if (info.satpoint || info.location) {
          const satpoint = info.satpoint || info.location;
          const match = satpoint.match(/^([a-fA-F0-9]+):(\d+)/);
          if (match) {
            insc.utxo_txid = match[1];
            insc.utxo_vout = parseInt(match[2]) || 0;
          }
        }
        
        // Verify current owner
        const currentOwner = info.address || info.owner;
        if (currentOwner && currentOwner !== senderAddress) {
          return res.status(400).json({ success: false, error: `Ordinal is currently owned by ${currentOwner}, not ${senderAddress}` });
        }
      } catch (e) {
        console.warn('Failed to fetch ordinal location from indexer:', e.message);
      }
    }

    const scriptHex = getScriptPubKey(senderAddress);

    // Get the UTXO value from the inscription tx output
    let utxoSatoshis = 100000; // Default inscription output
    try {
      const rawTx = await rpcClient.call('getrawtransaction', [insc.utxo_txid, true]);
      if (rawTx && rawTx.vout && rawTx.vout[insc.utxo_vout]) {
        utxoSatoshis = Math.round(rawTx.vout[insc.utxo_vout].value * 100000000);
      }
    } catch { }

    // Load a funding UTXO for the fee
    const useIndexer = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
    let rawUtxos = [];
    if (useIndexer) {
      try { rawUtxos = await dbWallet.getAddressUtxos(senderAddress); } catch { }
    }
    if (rawUtxos.length === 0) {
      try { rawUtxos = await rpcClient.getAddressUtxos(senderAddress); } catch { }
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
        `UPDATE inscriptions SET to_address = $1, owner_address = $1, utxo_txid = $2, utxo_vout = 0 WHERE inscription_txid = $3 OR ord_id = $3`,
        [toAddress, txid, inscriptionTxid]
      );
    } catch { }

    console.log(`Inscription ${inscriptionTxid} transferred to ${toAddress}, new txid: ${txid}`);

    res.json({
      success: true,
      txid,
      from: senderAddress,
      to: toAddress,
      inscriptionTxid,
      ordId: insc.ord_id,
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * Ord-Indexer Proxy Routes
 * Forwards requests to the ord-indexer service (Rust, port 8080).
 * ──────────────────────────────────────────────────────────────────────────────
 */
const ORD_URL = process.env.ORD_INDEXER_URL || 'http://localhost:8080';

async function ordFetch(path, accept = 'application/json') {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch(`${ORD_URL}${path}`, {
    headers: { Accept: accept },
    timeout: 15000,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`ord-indexer error ${res.status} for ${path}:`, text);
    throw new Error(`ord-indexer returned ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

/**
 * Helper to fetch content-type via HEAD request if indexer doesn't provide it in JSON metadata.
 */
async function sniffContentType(id) {
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`${ORD_URL}/content/${encodeURIComponent(id)}`, {
      method: 'HEAD',
      timeout: 5000
    });
    if (res.ok) {
      return String(res.headers.get('content-type') || 'application/octet-stream');
    }

  } catch (e) {
    console.warn(`Sniffing failed for ${id}:`, e.message);
  }
  return 'application/octet-stream';
}


/**
 * GET /api/ordinals/explorer/status
 * Check whether the ord-indexer is reachable and has synced blocks.
 */
router.get('/explorer/status', async (req, res) => {
  try {
    const blockCount = await ordFetch('/block-count', 'text/plain');
    res.json({ ok: true, blockCount: String(blockCount).trim() });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/ordinals/explorer/inscriptions?page=0
 * Latest inscriptions from ord-indexer. 
 * NOTE: Some versions of ord only return HTML here, so we parse it if needed.
 */
router.get('/explorer/inscriptions', async (req, res) => {
  try {
    const page = req.query.page || '0';
    // ord indexer: /inscriptions is "latest", /inscriptions/N is "starting from N"
    const path = (page === '0' || !page) ? '/inscriptions' : `/inscriptions/${page}`;
    const rawData = await ordFetch(path, 'text/html');

    // If it's already JSON (not expected here but for robustness)
    if (typeof rawData === 'object') {
      return res.json({ success: true, data: rawData });
    }

    // Parse HTML to extract inscription IDs
    // Format: <a href=/inscription/ID>... 
    // IDs can be various lengths in this version of ord
    const idRegex = /\/inscription\/([a-zA-Z0-9]+)/g;
    const matches = [...rawData.matchAll(idRegex)];

    // Dedup IDs
    const uniqueIds = [];
    const seen = new Set();
    for (const match of matches) {
      const id = match[1];
      if (!seen.has(id)) {
        seen.add(id);
        uniqueIds.push(id);
      }
    }

    // Fetch details for each ID in parallel (limit to 20 to avoid overwhelming)
    const detailPromises = uniqueIds.slice(0, 20).map(async (id) => {
      try {
        const d = await ordFetch(`/inscription/${encodeURIComponent(id)}?json=true`);
        // The indexer response can vary significantly between versions.
        // We look for metadata at both the root (d) and inside 'inscription' (d.inscription).
        const info = (d?.inscription && typeof d.inscription === 'object') ? d.inscription : d;

        // Robustly clean and stringify metadata fields
        const clean = (val) => {
          if (val === undefined || val === null) return '';
          if (Array.isArray(val)) return Buffer.from(val).toString('utf-8');
          let s = String(val);
          if (s.startsWith('[') && s.endsWith(']')) {
            try {
              const p = JSON.parse(s);
              if (Array.isArray(p)) return Buffer.from(p).toString('utf-8');
            } catch (e) { }
          }
          return s;
        };

        const rawCT = info.content_type || info.media_type || d.content_type || d.media_type || '';
        let contentType = clean(rawCT);
        if (!contentType || contentType === 'application/octet-stream') {
          contentType = await sniffContentType(id);
        }
        if (contentType) contentType = clean(contentType).split(';')[0].trim();

        // Direct access with root fallbacks
        const num = info.inscription_number ?? d.inscription_number ?? info.number ?? d.number ?? info.num ?? d.num;
        const h = info.genesis_height ?? d.genesis_height ?? info.height ?? d.height ?? info.block_height ?? d.block_height;

        return {
          id,
          number: (num !== undefined && num !== null && num !== '') ? String(num) : '?',
          content_type: clean(contentType),
          genesis_height: (h !== undefined && h !== null && h !== '') ? String(h) : '?',
          timestamp: info.timestamp || d.timestamp,
        };





      } catch (e) {
        // Fallback for metadata failure: Sniff content type via HEAD
        let contentType = await sniffContentType(id);
        if (contentType) {
          contentType = String(contentType).split(';')[0].trim().toLowerCase();
        }
        return {
          id,
          number: '?',
          content_type: contentType || 'application/octet-stream',
          genesis_height: '?',
          timestamp: undefined,
          error: true
        };
      }
    });



    const results = await Promise.all(detailPromises);
    res.json({ success: true, data: { inscriptions: results } });


  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});


/**
 * GET /api/ordinals/explorer/inscription/:id
 * Details for a specific inscription.
 */
router.get('/explorer/inscription/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const data = await ordFetch(`/inscription/${encodeURIComponent(id)}?json=true`);
    res.json({ success: true, data });
  } catch (err) {
    // If metadata fails, try to at least provide the content-type via sniffing
    const contentType = await sniffContentType(id);
    res.json({
      success: true,
      data: {
        inscription_id: id,
        id,
        content_type: contentType,
        media_type: contentType,
        number: '?',
        genesis_height: '?',
        status: 'error-recovering'
      }
    });
  }
});

/**
 * GET /api/ordinals/explorer/inscription/:id/content
 * Proxy raw inscription content (image, text, etc.) from ord-indexer.
 */
router.get('/explorer/inscription/:id/content', async (req, res) => {
  try {
    const { id } = req.params;
    const fetch = (await import('node-fetch')).default;
    const upstream = await fetch(`${ORD_URL}/content/${encodeURIComponent(id)}`, { timeout: 15000 });
    if (!upstream.ok) return res.status(upstream.status).end();
    const ct = upstream.headers.get('content-type') || 'application/octet-stream';
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    // Allow framing from frontend
    res.removeHeader('X-Frame-Options');
    res.set('Content-Security-Policy', "frame-ancestors 'self' http://localhost:3000 http://localhost:3002");
    upstream.body.pipe(res);

  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/ordinals/explorer/address/:address/inscriptions
 * Inscriptions associated with an address.
 */
router.get('/explorer/address/:address/inscriptions', async (req, res) => {
  try {
    const { address } = req.params;
    const data = await ordFetch(`/inscriptions/address/${encodeURIComponent(address)}`);
    res.json({ success: true, data });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/ordinals/explorer/block-count
 * Current block count from ord-indexer.
 */
router.get('/explorer/block-count', async (req, res) => {
  try {
    const blockCount = await ordFetch('/block-count', 'text/plain');
    res.json({ success: true, blockCount: String(blockCount).trim() });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ordinals/sync
 * Trigger immediate sync of ordinals for all watched addresses.
 */
router.post('/sync', async (req, res) => {
  try {
    const { triggerSync } = await import('../services/ordinalSyncService.js');
    const result = await triggerSync();
    res.json({ 
      success: true, 
      message: `Sync complete: ${result.totalNew} new, ${result.totalUpdated} updated ordinals`,
      ...result 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ordinals/sync/:address
 * Trigger sync for a specific address.
 */
router.post('/sync/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { syncAddress } = await import('../services/ordinalSyncService.js');
    const result = await syncAddress(address);
    res.json({ 
      success: true, 
      address,
      message: `Sync complete for ${address}: ${result.newCount} new, ${result.updateCount} updated`,
      ...result 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

