import express from 'express';
import rpcClient from '../services/rpcClient.js';
import dbWallet from '../services/dbWallet.js';
import explorerClient from '../services/explorerClient.js';
import { getTipHeight, getPool } from '../services/db.js';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';

const router = express.Router();
const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

// B1T Network Parameters (aus chainparams.cpp)
const B1T_NETWORK = {
  messagePrefix: '\x18Bit Signed Message:\n',
  bech32: 'bc',
  bip32: {
    public: 0x02FACAFD,  // EXT_PUBLIC_KEY aus chainparams.cpp
    private: 0x02FAC398, // EXT_SECRET_KEY aus chainparams.cpp
  },
  pubKeyHash: 0x19, // PUBKEY_ADDRESS: 25 (Adressen beginnen mit 'B')
  scriptHash: 0x16, // SCRIPT_ADDRESS: 22 (P2SH)
  wif: 0x9E,        // SECRET_KEY: 158 (WIF Private Keys)
};

// SLIP-044 Coin Type für B1T
const B1T_COIN_TYPE = 3141; // 0x80000c45

// Generate Mnemonic
router.post('/generate-mnemonic', (req, res) => {
  try {
    const { strength = 128 } = req.body; // 128 = 12 words, 256 = 24 words
    const mnemonic = bip39.generateMnemonic(strength);
    res.json({ success: true, mnemonic });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Validate Mnemonic
router.post('/validate-mnemonic', (req, res) => {
  try {
    const { mnemonic } = req.body;
    const isValid = bip39.validateMnemonic(mnemonic);
    res.json({ success: true, valid: isValid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Derive Account XPUB from Mnemonic
router.post('/derive-xpub', (req, res) => {
  try {
    const { mnemonic, account = 0 } = req.body;

    if (!bip39.validateMnemonic(mnemonic)) {
      return res.status(400).json({ success: false, error: 'Ungültiger Seed' });
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, B1T_NETWORK);

    // BIP44 Account: m/44'/3141'/account'
    const path = `m/44'/${B1T_COIN_TYPE}'/${account}'`;
    const accountNode = root.derivePath(path);
    const xpub = accountNode.neutered().toBase58();

    res.json({ success: true, xpub, path, blockbookUrl: `https://blockbook.b1tcore.org/xpub/${xpub}` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Derive Address from Mnemonic
router.post('/derive-address', (req, res) => {
  try {
    const { mnemonic, index = 0, change = 0 } = req.body;

    if (!bip39.validateMnemonic(mnemonic)) {
      return res.status(400).json({ success: false, error: 'Ungültiger Seed' });
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, B1T_NETWORK);

    // BIP44 Path: m/44'/3141'/0'/change/index (SLIP-044 für B1T)
    const path = `m/44'/${B1T_COIN_TYPE}'/0'/${change}/${index}`;
    const child = root.derivePath(path);

    const { address } = bitcoin.payments.p2pkh({
      pubkey: child.publicKey,
      network: B1T_NETWORK,
    });

    res.json({
      success: true,
      address,
      path,
      publicKey: child.publicKey.toString('hex'),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Multiple Addresses
router.post('/derive-addresses', (req, res) => {
  try {
    const { mnemonic, count = 5, change = 0, startIndex = 0 } = req.body;

    if (!bip39.validateMnemonic(mnemonic)) {
      return res.status(400).json({ success: false, error: 'Ungültiger Seed' });
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, B1T_NETWORK);

    const addresses = [];
    for (let i = startIndex; i < startIndex + count; i++) {
      const path = `m/44'/${B1T_COIN_TYPE}'/0'/${change}/${i}`;
      const child = root.derivePath(path);
      const { address } = bitcoin.payments.p2pkh({
        pubkey: child.publicKey,
        network: B1T_NETWORK,
      });

      addresses.push({
        index: i,
        address,
        path,
        publicKey: child.publicKey.toString('hex'),
      });
    }

    res.json({ success: true, addresses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Address Balance
router.get('/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;

    // Validierung ohne RPC: prüfe Adress-Format lokal über bitcoinjs-lib
    try {
      // Wirft Fehler bei ungültigen Adressen
      bitcoin.address.toOutputScript(address, B1T_NETWORK);
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Ungültige Adresse' });
    }
    const useIndexer = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
    let balance;
    try {
      balance = useIndexer
        ? await dbWallet.getAddressBalance(address)
        : await rpcClient.getAddressBalance(address);
    } catch (err) {
      // Fallback: Explorer API direkt nutzen, wenn RPC/DB nicht verfügbar
      try {
        const info = await explorerClient.getAddress(address);
        balance = {
          balance: info.balance || 0,
          received: info.received || 0,
          sent: info.sent || 0,
        };
      } catch (explErr) {
        return res.status(500).json({ success: false, error: err.message || explErr.message || 'Balance nicht verfügbar' });
      }
    }
    res.json({ success: true, address, ...balance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Address UTXOs
router.get('/utxos/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const useIndexer = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
    const utxos = useIndexer
      ? await dbWallet.getAddressUtxos(address)
      : await rpcClient.getAddressUtxos(address);
    res.json({ success: true, address, utxos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Live Balance (confirmed + mempool deltas)
router.get('/live-balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 1000 } = req.query;

    // Validierung lokal
    try { bitcoin.address.toOutputScript(address, B1T_NETWORK); } catch (e) {
      return res.status(400).json({ success: false, error: 'Ungültige Adresse' });
    }

    // Basis: bestätigte Balance
    const useIndexer = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
    let base;
    try {
      base = useIndexer ? await dbWallet.getAddressBalance(address) : await rpcClient.getAddressBalance(address);
    } catch (err) {
      // Explorer-Fallback
      try {
        const info = await explorerClient.getAddress(address);
        base = {
          balance: info.balance || 0,
          received: info.received || 0,
          sent: info.sent || 0,
        };
      } catch (explErr) {
        return res.status(500).json({ success: false, error: err.message || explErr.message || 'Balance nicht verfügbar' });
      }
    }

    // UTXO-Menge (für Outgoing‑Erkennung in Mempool)
    let utxos = [];
    try {
      utxos = useIndexer ? await dbWallet.getAddressUtxos(address) : await rpcClient.getAddressUtxos(address);
    } catch { }
    const utxoMap = new Map(utxos.map(u => [`${u.txid}:${u.outputIndex}`, u.satoshis]));

    // Mempool scannen (begrenzt)
    let pendingOutSats = 0;
    let pendingInSats = 0;
    try {
      const mempoolTxids = await rpcClient.getRawMempool();
      const slice = Array.isArray(mempoolTxids) ? mempoolTxids.slice(0, Math.min(parseInt(limit, 10) || 1000, mempoolTxids.length)) : [];

      // Vermeide Doppelzählung: einmal pro (prevout) und (txid:vout)
      const spentKeys = new Set();
      const inKeys = new Set();

      for (const txid of slice) {
        let tx;
        try { tx = await rpcClient.getRawTransaction(txid, true); } catch { continue; }

        // Outgoing: wenn ein vin auf unsere UTXOs verweist
        for (const vin of tx.vin || []) {
          const ptxid = vin.txid;
          const pvout = vin.vout;
          if (ptxid === undefined || pvout === undefined) continue;
          const key = `${ptxid}:${pvout}`;
          if (utxoMap.has(key) && !spentKeys.has(key)) {
            pendingOutSats += utxoMap.get(key) || 0;
            spentKeys.add(key);
          }
        }

        // Incoming: outputs an unsere Adresse
        for (const vout of tx.vout || []) {
          const spk = vout.scriptPubKey || {};
          const addrList = Array.isArray(spk.addresses) ? spk.addresses : [];
          const addr = spk.address || (addrList.length > 0 ? addrList[0] : null);
          if (addr === address) {
            const key = `${txid}:${vout.n}`;
            if (!inKeys.has(key)) {
              pendingInSats += Math.floor((vout.value || 0) * 100000000);
              inKeys.add(key);
            }
          }
        }
      }
    } catch { }

    const confirmed = Number(base.balance || 0);
    const pendingOut = pendingOutSats / 100000000;
    const pendingIn = pendingInSats / 100000000;
    const availableNow = Math.max(confirmed - pendingOut, 0); // spendable ohne unbestätigten Eingang
    const effectiveAfterConfirm = Math.max(confirmed - pendingOut + pendingIn, 0);

    return res.json({
      success: true,
      address,
      base: base,
      pending: {
        out: pendingOut,
        in: pendingIn,
      },
      balances: {
        confirmed,
        available: availableNow,
        effective: effectiveAfterConfirm,
      },
      meta: { utxoCount: utxos.length, mempoolScan: Number(limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Address Transactions
router.get('/transactions/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { start = 0, limit = 10 } = req.query;

    const useIndexer = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
    let transactions = [];
    let count = 0;
    // Hole chainTip ausschließlich über RPC, fallback auf DB-Tip – vermeide Explorer-Aufrufe
    let chainTip = 0;
    try { chainTip = await rpcClient.getBlockCount(); } catch { }
    if (!chainTip) { try { chainTip = await getTipHeight(); } catch { } }

    if (useIndexer) {
      const rows = await dbWallet.getAddressTransactions(address, parseInt(start), parseInt(limit));
      transactions = rows.map(r => ({
        txid: r.txid,
        time: r.time || undefined,
        blocktime: r.time || undefined,
        confirmations: (r.block_height && chainTip) ? Math.max(chainTip - r.block_height + 1, 0) : 0,
      }));
      count = rows.length;

      // Fallback: fehlende Bestätigungen via RPC auffüllen
      for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];
        if (!t.confirmations || t.confirmations <= 0) {
          try {
            const tx = await rpcClient.getRawTransaction(t.txid, true);
            const conf = parseInt(tx.confirmations || 0);
            if (conf > 0) {
              transactions[i] = {
                ...t,
                confirmations: conf,
                blocktime: tx.blocktime || t.blocktime,
                time: tx.blocktime || t.time,
              };
            }
          } catch (e) {
            // Ignoriere Fehler, wenn txindex fehlt; wir belassen confirmations=0
          }
        }
      }

      // Beträge berechnen: received/sent relativ zu dieser Adresse via DB-Outputs
      try {
        const client = await getPool().connect();
        try {
          for (let i = 0; i < transactions.length; i++) {
            const txid = transactions[i].txid;
            if (!txid) continue;

            // Summe der Outputs in dieser TX an diese Adresse (eingehend oder Change)
            const recvRes = await client.query(
              'SELECT COALESCE(SUM(value_satoshi), 0) AS s FROM outputs WHERE address=$1 AND txid=$2',
              [address, txid]
            );
            const receivedSats = Number(recvRes.rows[0]?.s || 0);

            // Summe der zuvor erhaltenen Outputs dieser Adresse, die in dieser TX als Inputs ausgegeben wurden
            const inRes = await client.query(
              'SELECT COALESCE(SUM(value_satoshi), 0) AS s FROM outputs WHERE address=$1 AND spent_txid=$2',
              [address, txid]
            );
            const inputSats = Number(inRes.rows[0]?.s || 0);

            // Wenn wir Inputs haben, ist es eine ausgehende TX: sent = inputs - changeBack
            // Andernfalls ist es eine eingehende TX: received = receivedSats
            const sentSats = inputSats > 0 ? Math.max(inputSats - receivedSats, 0) : 0;
            const recvFinalSats = inputSats > 0 ? 0 : receivedSats;

            transactions[i] = {
              ...transactions[i],
              sent: sentSats / 100000000,
              received: recvFinalSats / 100000000,
            };
          }
        } finally {
          client.release();
        }
      } catch (e) {
        // Wenn DB-Abfrage fehlschlägt, lassen wir Beträge weg
      }
    } else {
      // Explorer-Details nutzen, um sent/received zu erhalten
      const detailed = await explorerClient.getAddressTransactionsDetailed(address, parseInt(start), parseInt(limit));
      count = detailed.length;
      transactions = detailed.map((d) => ({
        txid: d.txid,
        time: d.timestamp || d.time || d.blocktime || undefined,
        blocktime: d.timestamp || d.time || d.blocktime || undefined,
        confirmations: 0,
        sent: (typeof d.sent === 'number') ? d.sent : (typeof d.sent === 'string' ? parseFloat(d.sent) : 0),
        received: (typeof d.received === 'number') ? d.received : (typeof d.received === 'string' ? parseFloat(d.received) : 0),
      }));

      // Bestätigungen via RPC auffüllen, falls möglich
      for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];
        try {
          const tx = await rpcClient.getRawTransaction(t.txid, true);
          transactions[i] = {
            ...t,
            confirmations: parseInt(tx.confirmations || t.confirmations || 0),
            time: t.time || tx.blocktime || tx.time || undefined,
            blocktime: t.blocktime || tx.blocktime || tx.time || undefined,
          };
        } catch { }
      }
    }

    res.json({ success: true, address, count, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send Transaction
router.post('/send', async (req, res) => {
  try {
    const { mnemonic, fromAddress, toAddress, amount, fee, addressIndex = 0, useAll = false, fromAddresses = [], addressIndices = [], changeIndex = 0 } = req.body;

    // Schneller Healthcheck: ist der RPC-Node erreichbar? (5s Timeout)
    try {
      await rpcClient.call('getblockcount', [], 5000);
    } catch (e) {
      return res.status(503).json({ success: false, error: 'B1T Core Node nicht erreichbar' });
    }

    // Validate inputs
    if (!bip39.validateMnemonic(mnemonic)) {
      return res.status(400).json({ success: false, error: 'Ungültiger Seed' });
    }

    const toValidation = await rpcClient.call('validateaddress', [toAddress], 7000);
    if (!toValidation.isvalid) {
      return res.status(400).json({ success: false, error: 'Ungültige Zieladresse' });
    }

    // Determine minimum fee from mempool/network and clamp provided fee
    let minFee = 0.0001;
    try {
      const mempool = await rpcClient.getMempoolInfo();
      const network = await rpcClient.getNetworkInfo();
      const relay = (network && typeof network.relayfee === 'number') ? network.relayfee : 0.0001;
      const dynMin = (mempool && typeof mempool.mempoolminfee === 'number') ? mempool.mempoolminfee : 0;
      minFee = Math.max(relay, dynMin, 0.0001);
    } catch { }

    const effectiveFee = Math.max(typeof fee === 'number' ? fee : 0.0001, minFee);

    // Calculate amounts in satoshis
    const amountSat = Math.floor(amount * 100000000);
    const feeSat = Math.floor(effectiveFee * 100000000);

    // Collect UTXOs (single or multi-address)
    const useIndexer = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
    let utxos = [];
    if (useAll) {
      if (!Array.isArray(fromAddresses) || fromAddresses.length === 0) {
        return res.status(400).json({ success: false, error: 'Keine Quelladressen angegeben' });
      }
      if (!Array.isArray(addressIndices) || addressIndices.length !== fromAddresses.length) {
        return res.status(400).json({ success: false, error: 'Indexliste fehlt oder fehlerhaft' });
      }
      for (let i = 0; i < fromAddresses.length; i++) {
        const addr = fromAddresses[i];
        const idx = addressIndices[i];
        let list = useIndexer ? await dbWallet.getAddressUtxos(addr) : await rpcClient.getAddressUtxos(addr);
        // Fallback auf RPC/Explorer, falls Indexer (oder primärer Pfad) keine UTXOs liefert
        if (!Array.isArray(list) || list.length === 0) {
          try { list = await rpcClient.getAddressUtxos(addr); } catch { }
        }
        for (const u of list) {
          utxos.push({ ...u, ownerAddress: addr, ownerIndex: idx });
        }
      }
    } else {
      // Single address mode
      let list = useIndexer ? await dbWallet.getAddressUtxos(fromAddress) : await rpcClient.getAddressUtxos(fromAddress);
      if (!Array.isArray(list) || list.length === 0) {
        try { list = await rpcClient.getAddressUtxos(fromAddress); } catch { }
      }
      utxos = list.map(u => ({ ...u, ownerAddress: fromAddress, ownerIndex: addressIndex }));
    }

    if (utxos.length === 0) {
      return res.status(400).json({ success: false, error: 'Keine UTXOs verfügbar' });
    }

    // Select UTXOs (simple accumulation)
    let selectedUtxos = [];
    let totalInput = 0;
    for (const utxo of utxos) {
      selectedUtxos.push(utxo);
      totalInput += utxo.satoshis;
      if (totalInput >= amountSat + feeSat) break;
    }

    if (totalInput < amountSat + feeSat) {
      return res.status(400).json({
        success: false,
        error: 'Unzureichendes Guthaben',
        required: (amountSat + feeSat) / 100000000,
        available: totalInput / 100000000
      });
    }

    // Build transaction
    const psbt = new bitcoin.Psbt({ network: B1T_NETWORK });

    // Add inputs with previous tx hex
    for (const utxo of selectedUtxos) {
      let txHex;
      try {
        txHex = await rpcClient.call('getrawtransaction', [utxo.txid], 10000);
      } catch (e) {
        try {
          const txObj = await explorerClient.getTransaction(utxo.txid);
          txHex = txObj?.hex || txObj?.rawtx || txObj?.raw || (txObj?.tx && txObj.tx.hex) || null;
        } catch (explErr) { }

        if (!txHex) {
          const msg = String(e.message || '').toLowerCase();
          if (msg.includes('no such mempool') || msg.includes('not found') || msg.includes('txindex')) {
            return res.status(400).json({
              success: false,
              error: 'Tx-Vorlage nicht gefunden. Bitte txindex=1 in bit.conf aktivieren und Node neu starten.',
            });
          }
          return res.status(500).json({ success: false, error: 'Vorherige Transaktion nicht verfügbar (RPC/Explorer)' });
        }
      }

      psbt.addInput({
        hash: utxo.txid,
        index: utxo.outputIndex,
        nonWitnessUtxo: Buffer.from(txHex, 'hex'),
      });
    }

    // Add main output
    psbt.addOutput({ address: toAddress, value: amountSat });

    // Add change output if needed (to first source address or provided changeIndex)
    const change = totalInput - amountSat - feeSat;
    if (change > 546) {
      const changeAddr = useAll ? (fromAddresses[0]) : fromAddress;
      psbt.addOutput({ address: changeAddr, value: change });
    }

    // Sign inputs (per input ownerIndex)
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, B1T_NETWORK);
    selectedUtxos.forEach((utxo, i) => {
      const path = `m/44'/${B1T_COIN_TYPE}'/0'/0/${utxo.ownerIndex}`;
      const keyPair = root.derivePath(path);
      psbt.signInput(i, ECPair.fromPrivateKey(keyPair.privateKey, { network: B1T_NETWORK }));
    });

    psbt.finalizeAllInputs();

    const txHex = psbt.extractTransaction().toHex();
    const txid = await rpcClient.sendRawTransaction(txHex);

    res.json({
      success: true,
      txid,
      amount,
      fee: feeSat / 100000000,
      minFee,
      change: Math.max(change, 0) / 100000000,
      inputsUsed: selectedUtxos.length,
      multiSource: !!useAll,
    });
  } catch (error) {
    console.error('Send Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Estimate Fee
router.get('/estimate-fee', async (req, res) => {
  try {
    const { blocks = 6 } = req.query;
    const blocksNum = parseInt(blocks);
    const fee = await rpcClient.estimateFee(blocksNum);
    let minFee = 0.0001;
    try {
      const mempool = await rpcClient.getMempoolInfo();
      const network = await rpcClient.getNetworkInfo();
      const relay = (network && typeof network.relayfee === 'number') ? network.relayfee : 0.0001;
      const dynMin = (mempool && typeof mempool.mempoolminfee === 'number') ? mempool.mempoolminfee : 0;
      minFee = Math.max(relay, dynMin, 0.0001);
    } catch { }

    // Ensure suggested fee respects minimum
    const suggested = Math.max(fee, minFee);
    res.json({ success: true, fee: suggested, minFee, blocks: blocksNum });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Broadcast Raw Transaction
router.post('/broadcast', async (req, res) => {
  try {
    const { hex } = req.body;
    if (!hex || typeof hex !== 'string') {
      return res.status(400).json({ success: false, error: 'Raw hex missing' });
    }
    const txid = await rpcClient.sendRawTransaction(hex);
    res.json({ success: true, txid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== RABB1TS MINING ENDPOINTS ==========

// Mine a single attempt (create + sign via RPC, check TXID)
router.post('/rabb1ts/mine-attempt', async (req, res) => {
  try {
    const { txid, vout, address, wif, scriptPubKey, satoshis, sequence, targetZeros = 5 } = req.body;

    if (!txid || vout === undefined || !address || !wif || !scriptPubKey || !satoshis) {
      return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    const FEE = 192000; // ~0.00192 B1T (like original miner)
    const outputAmount = (satoshis - FEE) / 1e8;

    if (outputAmount <= 0) {
      return res.status(400).json({ success: false, error: 'UTXO too small for fee' });
    }

    // Create raw transaction with specific sequence
    const rawTx = await rpcClient.call('createrawtransaction', [
      [{ txid, vout, sequence: sequence || 0 }],
      { [address]: outputAmount },
      0
    ]);

    // Sign the transaction
    const signed = await rpcClient.call('signrawtransaction', [
      rawTx,
      [{ txid, vout, scriptPubKey, amount: satoshis / 1e8 }],
      [wif]
    ]);

    if (!signed.complete) {
      return res.status(400).json({ success: false, error: 'Signing failed', details: signed.errors });
    }

    // Decode to get TXID
    const decoded = await rpcClient.call('decoderawtransaction', [signed.hex]);
    const resultTxid = decoded.txid;

    // Check if TXID matches target
    const targetPrefix = '0'.repeat(targetZeros);
    const isMatch = resultTxid.startsWith(targetPrefix);

    res.json({
      success: true,
      txid: resultTxid,
      hex: signed.hex,
      sequence,
      isMatch,
      targetZeros
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mine a batch of attempts (for efficiency) - PARALLEL VERSION
router.post('/rabb1ts/mine-batch', async (req, res) => {
  try {
    const { txid, vout, address, wif, scriptPubKey, satoshis, startSequence = 0, batchSize = 100, targetZeros = 5 } = req.body;

    if (!txid || vout === undefined || !address || !wif || !scriptPubKey || !satoshis) {
      return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    const FEE = 192000;
    const outputAmount = (satoshis - FEE) / 1e8;

    if (outputAmount <= 0) {
      return res.status(400).json({ success: false, error: 'UTXO too small for fee' });
    }

    const targetPrefix = '0'.repeat(targetZeros);

    // Create array of sequences to process
    const sequences = Array.from({ length: batchSize }, (_, i) => startSequence + i);

    // Process in parallel chunks (don't overload RPC)
    const PARALLEL_LIMIT = 10; // Process 10 at a time
    let foundResult = null;
    let processed = 0;

    for (let i = 0; i < sequences.length && !foundResult; i += PARALLEL_LIMIT) {
      const chunk = sequences.slice(i, i + PARALLEL_LIMIT);

      const results = await Promise.all(chunk.map(async (seq) => {
        try {
          const rawTx = await rpcClient.call('createrawtransaction', [
            [{ txid, vout, sequence: seq }],
            { [address]: outputAmount },
            0
          ]);

          const signed = await rpcClient.call('signrawtransaction', [
            rawTx,
            [{ txid, vout, scriptPubKey, amount: satoshis / 1e8 }],
            [wif]
          ]);

          if (signed.complete) {
            const decoded = await rpcClient.call('decoderawtransaction', [signed.hex]);
            return {
              success: true,
              txid: decoded.txid,
              hex: signed.hex,
              sequence: seq,
              isMatch: decoded.txid.startsWith(targetPrefix)
            };
          }
          return { success: true, isMatch: false };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }));

      // Count successful attempts and check for matches
      for (const result of results) {
        if (result.success) {
          processed++;
          if (result.isMatch && !foundResult) {
            foundResult = {
              txid: result.txid,
              hex: result.hex,
              sequence: result.sequence
            };
          }
        }
      }
    }

    res.json({
      success: true,
      found: !!foundResult,
      result: foundResult,
      processed,
      nextSequence: startSequence + batchSize
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get UTXO details including scriptPubKey for mining
router.get('/rabb1ts/utxo-details/:address', async (req, res) => {
  try {
    const { address } = req.params;

    // Get UTXOs from DB or RPC
    const useIndexer = String(process.env.INDEXER_ENABLED || 'true').toLowerCase() === 'true';
    let utxos = [];

    try {
      utxos = useIndexer
        ? await dbWallet.getAddressUtxos(address)
        : await rpcClient.getAddressUtxos(address);
    } catch (e) {
      console.warn('UTXO fetch failed, trying fallback:', e.message);
      try {
        utxos = await rpcClient.getAddressUtxos(address);
      } catch { }
    }

    if (!utxos || utxos.length === 0) {
      return res.json({ success: true, utxos: [] });
    }

    // Generate scriptPubKey from address (P2PKH)
    let defaultScriptPubKey = null;
    try {
      const outputScript = bitcoin.address.toOutputScript(address, B1T_NETWORK);
      defaultScriptPubKey = outputScript.toString('hex');
    } catch (e) {
      console.warn('Could not generate scriptPubKey from address:', e.message);
    }

    // Build enriched UTXOs
    const enrichedUtxos = [];
    for (const utxo of utxos) {
      const vout = utxo.outputIndex !== undefined ? utxo.outputIndex : (utxo.vout !== undefined ? utxo.vout : 0);
      const satoshis = utxo.satoshis || utxo.value || 0;

      let scriptPubKey = utxo.script || utxo.scriptPubKey || defaultScriptPubKey;
      let confirmations = 0;

      // Try to get actual scriptPubKey from RPC (optional enhancement)
      if (!scriptPubKey) {
        try {
          const txData = await rpcClient.call('getrawtransaction', [utxo.txid, true]);
          const voutData = txData.vout[vout];
          scriptPubKey = voutData?.scriptPubKey?.hex || defaultScriptPubKey;
          confirmations = txData.confirmations || 0;
        } catch {
          // Use default scriptPubKey
          scriptPubKey = defaultScriptPubKey;
        }
      }

      // Only include if we have a scriptPubKey
      if (scriptPubKey) {
        enrichedUtxos.push({
          txid: utxo.txid,
          vout: vout,
          satoshis: satoshis,
          scriptPubKey: scriptPubKey,
          confirmations: confirmations
        });
      }
    }

    res.json({ success: true, utxos: enrichedUtxos });
  } catch (error) {
    console.error('rabb1ts/utxo-details error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
