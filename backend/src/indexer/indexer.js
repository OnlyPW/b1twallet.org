import rpcClient from '../services/rpcClient.js';
import { initSchema, getTipHeight, insertBlock, insertTransaction, insertOutput, markOutputSpent, getPool } from '../services/db.js';

// B1T Network (für Adress-Decoding Fallback bei fehlenden explorer-Feldern)
const B1T_NETWORK = {
  messagePrefix: '\x18Bit Signed Message:\n',
  bech32: 'bc',
  bip32: { public: 0x02FACAFD, private: 0x02FAC398 },
  pubKeyHash: 0x19,
  scriptHash: 0x16,
  wif: 0x9E,
};

async function processBlock(height) {
  const hash = await rpcClient.call('getblockhash', [height]);
  const block = await rpcClient.call('getblock', [hash, 2]); // verbosity 2 = mit TX-Details

  await insertBlock({
    height,
    hash,
    prev_hash: block.previousblockhash,
    time: block.time,
    tx_count: Array.isArray(block.tx) ? block.tx.length : 0,
  });

  for (const tx of block.tx || []) {
    await insertTransaction({
      txid: tx.txid,
      block_height: height,
      time: tx.time || block.time,
      size: tx.size,
      vsize: tx.vsize,
      version: tx.version,
    });

    // Inputs: mark previous outputs as spent
    for (const vin of tx.vin || []) {
      if (vin.coinbase) continue; // Coinbase hat kein prevout
      const prevTxid = vin.txid;
      const prevVout = vin.vout;
      if (prevTxid !== undefined && prevVout !== undefined) {
        await markOutputSpent(prevTxid, prevVout, tx.txid, height);
      }
    }

    // Outputs: insert new UTXOs
    for (const vout of tx.vout || []) {
      const value = Math.round((vout.value || 0) * 100000000);
      let address = null;
      // explorer liefert oft addresses/addr; Core liefert address in scriptPubKey
      const spk = vout.scriptPubKey || {};
      if (spk.address) {
        address = spk.address;
      } else if (Array.isArray(spk.addresses) && spk.addresses.length > 0) {
        address = spk.addresses[0];
      }

      await insertOutput({
        txid: tx.txid,
        vout: vout.n,
        address,
        value_satoshi: value,
        script_pub_key: spk.hex || spk.asm || null,
        block_height: height,
      });
    }
  }
}

export async function startIndexer() {
  if (String(process.env.INDEXER_ENABLED || 'true').toLowerCase() !== 'true') {
    console.log('⏸ Indexer deaktiviert (INDEXER_ENABLED=false)');
    return;
  }

  // Warte bis DB erreichbar ist
  async function waitForDB(retries = 10, delayMs = 2000) {
    for (let i = 0; i < retries; i++) {
      try {
        await initSchema();
        return true;
      } catch (e) {
        console.warn(`DB nicht bereit (Versuch ${i + 1}/${retries}): ${e.message}`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    throw new Error('DB blieb unerreichbar');
  }

  await waitForDB();

  const startHeightEnv = parseInt(process.env.INDEXER_START_HEIGHT || '0', 10);
  let currentTip = await getTipHeight();
  let nextHeight = Math.max(currentTip + 1, startHeightEnv);

  async function syncLoop() {
    try {
      const chainTip = await rpcClient.getBlockCount();
      while (nextHeight <= chainTip) {
        console.log(`🧩 Indexiere Block ${nextHeight}/${chainTip}`);
        await processBlock(nextHeight);
        nextHeight += 1;
        currentTip = nextHeight - 1;
      }
    } catch (e) {
      console.error('Indexer Fehler:', e.message);
    }
  }

  // Initiale Synchronisierung & Polling
  await syncLoop();
  setInterval(syncLoop, 10_000); // alle 10 Sekunden neue Blöcke prüfen
}

export default { startIndexer };