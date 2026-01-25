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



async function processBlockData(height, block, client) {
  await insertBlock({
    height,
    hash: block.hash,
    prev_hash: block.previousblockhash,
    time: block.time,
    tx_count: Array.isArray(block.tx) ? block.tx.length : 0,
  }, client);

  for (const tx of block.tx || []) {
    await insertTransaction({
      txid: tx.txid,
      block_height: height,
      time: tx.time || block.time,
      size: tx.size,
      vsize: tx.vsize,
      version: tx.version,
    }, client);

    // Inputs: mark previous outputs as spent
    for (const vin of tx.vin || []) {
      if (vin.coinbase) continue; // Coinbase hat kein prevout
      const prevTxid = vin.txid;
      const prevVout = vin.vout;
      if (prevTxid !== undefined && prevVout !== undefined) {
        await markOutputSpent(prevTxid, prevVout, tx.txid, height, client);
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
      }, client);
    }
  }
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

      console.log(`🚀 Indexer startet bei Block ${nextHeight} (Chain Tip: ${chainTip})`);

      // Prefetch des ersten Blocks
      let nextBlockPromise = fetchBlock(nextHeight);

      while (nextHeight <= chainTip) {
        // Log nur alle 100 Blöcke oder wenn fast am Tip
        if (nextHeight % 100 === 0 || nextHeight > chainTip - 10) {
          console.log(`🧩 Indexiere Block ${nextHeight}/${chainTip}`);
        }

        // 1. Hole Daten (warte auf Promise)
        let blockData;
        try {
          blockData = await nextBlockPromise;
        } catch (e) {
          console.error(`Fehler beim Laden von Block ${nextHeight}:`, e.message);
          await new Promise(r => setTimeout(r, 2000));
          // Retry fetching this block
          nextBlockPromise = fetchBlock(nextHeight);
          continue;
        }

        // 2. Starte Fetch für NÄCHSTEN Block (parallel zur DB-Arbeit)
        if (nextHeight < chainTip) {
          nextBlockPromise = fetchBlock(nextHeight + 1);
        }

        // 3. DB Transaction
        const client = await getPool().connect();
        try {
          await client.query('BEGIN');
          await processBlockData(nextHeight, blockData, client);
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          console.error(`Fehler beim Speichern von Block ${nextHeight}:`, e.message);
          throw e; // Break loop, wait for retry interval
        } finally {
          client.release();
        }

        nextHeight++;

        // Wenn wir den Chain Tip erreichen, aktualisieren wir ihn, falls neue Blöcke angekommen sind
        if (nextHeight > chainTip) {
          const newTip = await rpcClient.getBlockCount();
          if (newTip > chainTip) {
            // Es gibt noch mehr zu tun, loop läuft weiter (via while condition)
            // loop variable chainTip ist local const, also müssen wir vorsichtig sein.
            // Aber besser ist `break` und neu aufrufen via setInterval loop
            break;
          }
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