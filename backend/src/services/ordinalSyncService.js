import { getPool, getWatchedAddresses, upsertReceivedInscription } from './db.js';

const ORD_URL = process.env.ORD_INDEXER_URL || 'http://localhost:8080';
const SYNC_ENABLED = String(process.env.ORD_SYNC_ENABLED || 'true').toLowerCase() === 'true';
const SYNC_INTERVAL = parseInt(process.env.ORD_SYNC_INTERVAL || '30000', 10);

let isRunning = false;
let syncTimeout = null;

async function ordFetch(path, accept = 'application/json') {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch(`${ORD_URL}${path}`, {
    headers: { Accept: accept },
    timeout: 15000,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ord-indexer returned ${res.status}: ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

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
    console.warn(`[OrdinalSync] Content sniff failed for ${id}:`, e.message);
  }
  return 'application/octet-stream';
}

function parseOrdId(href) {
  if (!href) return null;
  const match = href.match(/\/inscription\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

async function fetchAddressInscriptions(address) {
  try {
    const rawData = await ordFetch(`/inscriptions/address/${encodeURIComponent(address)}`, 'text/html');
    
    if (typeof rawData === 'object' && rawData.inscriptions) {
      return rawData.inscriptions;
    }
    
    const idRegex = /\/inscription\/([a-zA-Z0-9]+)/g;
    const matches = [...rawData.matchAll(idRegex)];
    const uniqueIds = [];
    const seen = new Set();
    for (const match of matches) {
      const id = match[1];
      if (!seen.has(id)) {
        seen.add(id);
        uniqueIds.push(id);
      }
    }
    
    return uniqueIds.map(id => ({ id }));
  } catch (e) {
    console.warn(`[OrdinalSync] Failed to fetch inscriptions for ${address}:`, e.message);
    return [];
  }
}

async function fetchInscriptionDetails(ordId) {
  try {
    const d = await ordFetch(`/inscription/${encodeURIComponent(ordId)}?json=true`);
    const info = (d?.inscription && typeof d.inscription === 'object') ? d.inscription : d;
    
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
    
    let contentType = clean(info.content_type || info.media_type || d.content_type || d.media_type || '');
    if (!contentType || contentType === 'application/octet-stream') {
      contentType = await sniffContentType(ordId);
    }
    if (contentType) contentType = clean(contentType).split(';')[0].trim();
    
    const genesisTxid = info.genesis_txid || d.genesis_txid || (ordId.includes('i') ? ordId.split('i')[0] : ordId);
    const genesisHeight = info.genesis_height ?? d.genesis_height ?? info.height ?? d.height ?? info.block_height ?? d.block_height;
    const currentOwner = info.address || d.address || info.owner || d.owner;
    
    return {
      ord_id: ordId,
      inscription_txid: genesisTxid,
      content_type: contentType,
      genesis_height: genesisHeight ? parseInt(genesisHeight) : null,
      owner: currentOwner,
    };
  } catch (e) {
    console.warn(`[OrdinalSync] Failed to fetch details for ${ordId}:`, e.message);
    return null;
  }
}

async function syncAddress(address) {
  const inscriptions = await fetchAddressInscriptions(address);
  let newCount = 0;
  let updateCount = 0;
  
  for (const insc of inscriptions) {
    const ordId = insc.id || parseOrdId(insc.href || insc.id);
    if (!ordId) continue;
    
    const details = await fetchInscriptionDetails(ordId);
    if (!details) continue;
    
    try {
      const pool = getPool();
      const existing = await pool.query(
        `SELECT ord_id FROM inscriptions WHERE ord_id = $1`,
        [ordId]
      );
      
      if (existing.rows.length === 0) {
        await upsertReceivedInscription({
          ord_id: ordId,
          inscription_txid: details.inscription_txid,
          to_address: address,
          content_type: details.content_type,
          data_size: 0,
          genesis_height: details.genesis_height,
        });
        newCount++;
      } else {
        await pool.query(
          `UPDATE inscriptions SET to_address = $1, owner_address = $1, synced_at = $2 WHERE ord_id = $3 AND (to_address != $1 OR owner_address != $1)`,
          [address, Math.floor(Date.now() / 1000), ordId]
        );
        updateCount++;
      }
    } catch (e) {
      console.warn(`[OrdinalSync] DB error for ${ordId}:`, e.message);
    }
  }
  
  return { newCount, updateCount, total: inscriptions.length };
}

async function syncAllAddresses() {
  const addresses = await getWatchedAddresses();
  console.log(`[OrdinalSync] Syncing ${addresses.length} addresses...`);
  
  let totalNew = 0;
  let totalUpdated = 0;
  
  for (const address of addresses) {
    try {
      const result = await syncAddress(address);
      totalNew += result.newCount;
      totalUpdated += result.updateCount;
      if (result.newCount > 0) {
        console.log(`[OrdinalSync] ${address}: +${result.newCount} new, ${result.updateCount} updated`);
      }
    } catch (e) {
      console.warn(`[OrdinalSync] Error syncing ${address}:`, e.message);
    }
  }
  
  console.log(`[OrdinalSync] Sync complete: ${totalNew} new, ${totalUpdated} updated ordinals`);
  return { totalNew, totalUpdated };
}

async function syncLoop() {
  if (!isRunning) return;
  
  try {
    await syncAllAddresses();
  } catch (e) {
    console.error('[OrdinalSync] Sync loop error:', e.message);
  }
  
  if (isRunning) {
    syncTimeout = setTimeout(syncLoop, SYNC_INTERVAL);
  }
}

export function startSync() {
  if (!SYNC_ENABLED) {
    console.log('[OrdinalSync] Sync disabled (ORD_SYNC_ENABLED=false)');
    return;
  }
  
  if (isRunning) {
    console.log('[OrdinalSync] Already running');
    return;
  }
  
  isRunning = true;
  console.log(`[OrdinalSync] Starting ordinal sync service (interval: ${SYNC_INTERVAL}ms)`);
  
  syncLoop();
}

export function stopSync() {
  isRunning = false;
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  console.log('[OrdinalSync] Sync service stopped');
}

export async function triggerSync() {
  return await syncAllAddresses();
}

export { syncAddress, syncAllAddresses };

export default { startSync, stopSync, triggerSync, syncAddress, syncAllAddresses };
