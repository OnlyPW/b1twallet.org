import rpcClient from '../services/rpcClient.js';
import { initSchema, getTipHeight, insertBlock, insertTransactionsBulk, insertOutputsBulk, markOutputSpent, getPool } from '../services/db.js';

// Batch-Größe aus Umgebung (INDEXER_BATCH_SIZE); Fallback 1000 nur wenn nicht in .env/docker gesetzt
const BATCH_SIZE = Math.max(1, parseInt(process.env.INDEXER_BATCH_SIZE || '1000', 10));

async function processBlockData(height, block, client) {
  await insertBlock({
    height,
    hash: block.hash,
    prev_hash: block.previousblockhash,
    time: block.time,
    tx_count: Array.isArray(block.tx) ? block.tx.length : 0,
  }, client);

  const txs = block.tx || [];
  const transactionRows = txs.map(tx => ({
    txid: tx.txid,
    block_height: height,
    time: tx.time || block.time,
    size: tx.size,
    vsize: tx.vsize,
    version: tx.version,
  }));
  await insertTransactionsBulk(transactionRows, client);

  // Inputs: mark previous outputs as spent (pro TX nötig, Reihenfolge beibehalten)
  for (const tx of txs) {
    for (const vin of tx.vin || []) {
      if (vin.coinbase) continue;
      const prevTxid = vin.txid;
      const prevVout = vin.vout;
      if (prevTxid !== undefined && prevVout !== undefined) {
        await markOutputSpent(prevTxid, prevVout, tx.txid, height, client);
      }
    }
  }

  // Outputs: ein Bulk-Insert pro Block
  const outputRows = [];
  for (const tx of txs) {
    const spkDefault = {};
    for (const vout of tx.vout || []) {
      const value = Math.round((vout.value || 0) * 100000000);
      const spk = vout.scriptPubKey || spkDefault;
      let address = null;
      if (spk.address) address = spk.address;
      else if (Array.isArray(spk.addresses) && spk.addresses.length > 0) address = spk.addresses[0];
      outputRows.push({
        txid: tx.txid,
        vout: vout.n,
        address,
        value_satoshi: value,
        script_pub_key: spk.hex || spk.asm || null,
        block_height: height,
      });
    }
  }
  await insertOutputsBulk(outputRows, client);
}

async function fetchBlock(height) {
  const hash = await rpcClient.call('getblockhash', [height]);
  return await rpcClient.call('getblock', [hash, 2]); // verbosity 2 = mit TX-Details
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
      if (nextHeight > chainTip) return;

      console.log(`🚀 Indexer startet bei Block ${nextHeight} (Chain Tip: ${chainTip}, Batch: ${BATCH_SIZE} Blöcke)`);

      let totalTransactions = 0;

      while (nextHeight <= chainTip) {
        const batchCount = Math.min(BATCH_SIZE, chainTip - nextHeight + 1);
        const batchEnd = nextHeight + batchCount - 1;

        const blocks = [];
        for (let i = 0; i < batchCount; i++) {
          const height = nextHeight + i;
          try {
            const block = await fetchBlock(height);
            blocks.push({ height, block });
          } catch (e) {
            console.error(`Fehler beim Laden von Block ${height}:`, e.message);
            await new Promise(r => setTimeout(r, 2000));
            i--;
            continue;
          }
        }

        const txInBatch = blocks.reduce((sum, { block }) => sum + (block.tx || []).length, 0);
        totalTransactions += txInBatch;
        console.log(`🧩 Batch ${nextHeight}–${batchEnd}: ${blocks.length} Blöcke, ${txInBatch} Transaktionen (insgesamt ${totalTransactions} Tx)`);

        const client = await getPool().connect();
        try {
          await client.query('BEGIN');
          for (const { height, block } of blocks) {
            await processBlockData(height, block, client);
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          console.error(`Fehler beim Speichern der Batch ${nextHeight}–${batchEnd}:`, e.message);
          throw e;
        } finally {
          client.release();
        }

        nextHeight += blocks.length;

        if (nextHeight > chainTip) {
          const newTip = await rpcClient.getBlockCount();
          if (newTip > chainTip) break;
        }
      }
    } catch (e) {
      console.error('Indexer Fehler:', e.message);
    }
  }

  // Initiale Synchronisierung & Polling
  await syncLoop();

  // Polling Loop
  setInterval(async () => {
    // Nur starten wenn wir nicht gerade noch im syncLoop sind? 
    // Da syncLoop async ist und blockiert (await), wird `setInterval` Stacken wenn wir nicht aufpassen?
    // Nein, `setInterval` feuert blind. Besser: `setTimeout` rekursiv oder Flag.
    // Einfachster Fix: syncLoop als 'running' markieren.
  }, 10_000);

  // Besserer Loop:
  const run = async () => {
    await syncLoop();
    setTimeout(run, 5000);
  };
  run();
}

export default { startIndexer };