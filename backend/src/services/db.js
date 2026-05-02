import { Pool } from 'pg';

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'b1t',
  password: process.env.DB_PASSWORD || 'b1tpass',
  database: process.env.DB_NAME || 'b1twallet',
  max: 10,
};

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool(config);
  }
  return pool;
}

export async function initSchema() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // Blocks
    await client.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        height INTEGER PRIMARY KEY,
        hash TEXT UNIQUE NOT NULL,
        prev_hash TEXT,
        time BIGINT,
        tx_count INTEGER DEFAULT 0
      );
    `);

    // Transactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        txid TEXT PRIMARY KEY,
        block_height INTEGER REFERENCES blocks(height) ON DELETE SET NULL,
        time BIGINT,
        size INTEGER,
        vsize INTEGER,
        version INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_block_height ON transactions(block_height);
    `);

    // Outputs (UTXOs)
    await client.query(`
      CREATE TABLE IF NOT EXISTS outputs (
        txid TEXT NOT NULL,
        vout INTEGER NOT NULL,
        address TEXT,
        value_satoshi BIGINT NOT NULL,
        script_pub_key TEXT,
        block_height INTEGER,
        spent BOOLEAN DEFAULT FALSE,
        spent_txid TEXT,
        spent_block_height INTEGER,
        PRIMARY KEY (txid, vout)
      );
      CREATE INDEX IF NOT EXISTS idx_outputs_address ON outputs(address);
      CREATE INDEX IF NOT EXISTS idx_outputs_unspent ON outputs(address, spent) WHERE spent = FALSE;
    `);

    // Addresses summary
    await client.query(`
      CREATE TABLE IF NOT EXISTS addresses (
        address TEXT PRIMARY KEY,
        balance_satoshi BIGINT DEFAULT 0,
        received_satoshi BIGINT DEFAULT 0,
        sent_satoshi BIGINT DEFAULT 0,
        last_seen_height INTEGER DEFAULT 0
      );
    `);

    // Inscriptions (ordinals created through the wallet or received)
    await client.query(`
      CREATE TABLE IF NOT EXISTS inscriptions (
        inscription_txid TEXT PRIMARY KEY,
        owner_address TEXT,
        to_address TEXT NOT NULL,
        content_type TEXT,
        data_size INTEGER DEFAULT 0,
        content BYTEA,
        total_transactions INTEGER DEFAULT 1,
        created_at BIGINT,
        utxo_txid TEXT,
        utxo_vout INTEGER DEFAULT 0,
        source TEXT DEFAULT 'created',
        synced_at BIGINT,
        ord_id TEXT,
        genesis_height INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_inscriptions_owner ON inscriptions(owner_address);
      CREATE INDEX IF NOT EXISTS idx_inscriptions_to ON inscriptions(to_address);
      CREATE INDEX IF NOT EXISTS idx_inscriptions_ord_id ON inscriptions(ord_id);
      CREATE INDEX IF NOT EXISTS idx_inscriptions_source ON inscriptions(source);
    `);

    // Nicknames (on-chain name registry)
    await client.query(`
      CREATE TABLE IF NOT EXISTS nicknames (
        nickname TEXT PRIMARY KEY,
        owner_pubkey TEXT NOT NULL,
        payout_address TEXT NOT NULL,
        registration_height INTEGER NOT NULL,
        active_until_height INTEGER NOT NULL,
        grace_until_height INTEGER NOT NULL,
        bond_amount_satoshi BIGINT DEFAULT 0,
        bond_txid TEXT,
        bond_vout INTEGER,
        last_update_txid TEXT NOT NULL,
        released BOOLEAN DEFAULT FALSE,
        bond_claimed BOOLEAN DEFAULT FALSE,
        status TEXT DEFAULT 'ACTIVE',
        created_at BIGINT,
        updated_at BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_nicknames_status ON nicknames(status);
      CREATE INDEX IF NOT EXISTS idx_nicknames_owner ON nicknames(owner_pubkey);
    `);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getTipHeight() {
  const res = await getPool().query('SELECT COALESCE(MAX(height), -1) AS tip FROM blocks');
  return res.rows[0]?.tip ?? -1;
}

// Helper to use provided client or get a new one
async function withClient(providedClient, callback) {
  const client = providedClient || await getPool().connect();
  try {
    return await callback(client);
  } finally {
    if (!providedClient) {
      client.release();
    }
  }
}

export async function upsertAddressStats(address, { addReceived = 0, addSent = 0, height = 0 }, dbClient = null) {
  return withClient(dbClient, async (client) => {
    await client.query(
      `INSERT INTO addresses(address, balance_satoshi, received_satoshi, sent_satoshi, last_seen_height)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (address)
       DO UPDATE SET
         balance_satoshi = addresses.balance_satoshi + $2,
         received_satoshi = addresses.received_satoshi + $3,
         sent_satoshi = addresses.sent_satoshi + $4,
         last_seen_height = GREATEST(addresses.last_seen_height, $5)`,
      [address, addReceived - addSent, addReceived, addSent, height]
    );
  });
}

export async function markOutputSpent(prevTxid, prevVout, spentTxid, spentHeight, dbClient = null) {
  return withClient(dbClient, async (client) => {
    const { rows } = await client.query('SELECT address, value_satoshi, spent FROM outputs WHERE txid=$1 AND vout=$2', [prevTxid, prevVout]);
    if (rows.length === 0) return;
    const { address, value_satoshi, spent } = rows[0];
    if (spent) return;
    await client.query(
      `UPDATE outputs SET spent=TRUE, spent_txid=$3, spent_block_height=$4 WHERE txid=$1 AND vout=$2`,
      [prevTxid, prevVout, spentTxid, spentHeight]
    );
    if (address) {
      await upsertAddressStats(address, { addSent: value_satoshi, height: spentHeight }, client);
    }
  });
}

export async function insertOutput({ txid, vout, address, value_satoshi, script_pub_key, block_height }, dbClient = null) {
  return withClient(dbClient, async (client) => {
    await client.query(
      `INSERT INTO outputs(txid, vout, address, value_satoshi, script_pub_key, block_height, spent)
       VALUES ($1,$2,$3,$4,$5,$6,FALSE)
       ON CONFLICT (txid, vout) DO NOTHING`,
      [txid, vout, address || null, value_satoshi, script_pub_key || null, block_height]
    );
    if (address) {
      await upsertAddressStats(address, { addReceived: value_satoshi, height: block_height }, client);
    }
  });
}

export async function insertTransaction({ txid, block_height, time, size, vsize, version }, dbClient = null) {
  return withClient(dbClient, async (client) => {
    await client.query(
      `INSERT INTO transactions(txid, block_height, time, size, vsize, version)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (txid) DO NOTHING`,
      [txid, block_height ?? null, time ?? null, size ?? null, vsize ?? null, version ?? null]
    );
  });
}

export async function insertBlock({ height, hash, prev_hash, time, tx_count }, dbClient = null) {
  return withClient(dbClient, async (client) => {
    await client.query(
      `INSERT INTO blocks(height, hash, prev_hash, time, tx_count)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (height) DO NOTHING`,
      [height, hash, prev_hash || null, time ?? null, tx_count ?? 0]
    );
  });
}

export async function insertTransactionsBulk(rows, dbClient = null) {
  if (!rows.length) return;
  return withClient(dbClient, async (client) => {
    const values = [];
    const params = [];
    let i = 1;
    for (const r of rows) {
      values.push(`($${i},$${i+1},$${i+2},$${i+3},$${i+4},$${i+5})`);
      params.push(r.txid, r.block_height ?? null, r.time ?? null, r.size ?? null, r.vsize ?? null, r.version ?? null);
      i += 6;
    }
    await client.query(
      `INSERT INTO transactions(txid, block_height, time, size, vsize, version)
       VALUES ${values.join(',')}
       ON CONFLICT (txid) DO NOTHING`,
      params
    );
  });
}

export async function getWatchedAddresses(dbClient = null) {
  return withClient(dbClient, async (client) => {
    const { rows } = await client.query(
      `SELECT DISTINCT address FROM addresses WHERE balance_satoshi > 0 OR last_seen_height > 0`
    );
    return rows.map(r => r.address);
  });
}

export async function upsertReceivedInscription({ ord_id, inscription_txid, to_address, content_type, data_size, genesis_height }, dbClient = null) {
  return withClient(dbClient, async (client) => {
    const now = Math.floor(Date.now() / 1000);
    await client.query(
      `INSERT INTO inscriptions (ord_id, inscription_txid, to_address, content_type, data_size, genesis_height, source, synced_at, owner_address)
       VALUES ($1, $2, $3, $4, $5, $6, 'received', $7, $3)
       ON CONFLICT (ord_id) DO UPDATE SET
         to_address = EXCLUDED.to_address,
         content_type = COALESCE(EXCLUDED.content_type, inscriptions.content_type),
         data_size = COALESCE(EXCLUDED.data_size, inscriptions.data_size),
         synced_at = EXCLUDED.synced_at,
         owner_address = EXCLUDED.owner_address
       WHERE inscriptions.source = 'received' OR inscriptions.source IS NULL`,
      [ord_id, inscription_txid, to_address, content_type, data_size, genesis_height, now]
    );
  });
}

export async function updateInscriptionOwner(ord_id, newOwnerAddress, newUtxoTxid, dbClient = null) {
  return withClient(dbClient, async (client) => {
    await client.query(
      `UPDATE inscriptions SET to_address = $1, owner_address = $1, utxo_txid = $2, synced_at = $3 WHERE ord_id = $4`,
      [newOwnerAddress, newUtxoTxid, Math.floor(Date.now() / 1000), ord_id]
    );
  });
}

export async function getInscriptionByOrdId(ord_id, dbClient = null) {
  return withClient(dbClient, async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM inscriptions WHERE ord_id = $1`,
      [ord_id]
    );
    return rows[0] || null;
  });
}

/** Bulk-Insert für Indexer: viele Outputs in einem Statement. */
export async function insertOutputsBulk(rows, dbClient = null) {
  if (!rows.length) return;
  return withClient(dbClient, async (client) => {
    const existingRes = await client.query(
      `SELECT txid, vout FROM outputs WHERE (txid, vout) IN (${rows.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(',')})`,
      rows.flatMap(r => [r.txid, r.vout])
    );
    const existingKeys = new Set(existingRes.rows.map(r => `${r.txid}:${r.vout}`));
    const newRows = rows.filter(r => !existingKeys.has(`${r.txid}:${r.vout}`));

    if (newRows.length === 0) return;

    const values = [];
    const params = [];
    let i = 1;
    for (const r of newRows) {
      values.push(`($${i},$${i+1},$${i+2},$${i+3},$${i+4},$${i+5},FALSE)`);
      params.push(r.txid, r.vout, r.address ?? null, r.value_satoshi, r.script_pub_key ?? null, r.block_height ?? null);
      i += 6;
    }
    await client.query(
      `INSERT INTO outputs(txid, vout, address, value_satoshi, script_pub_key, block_height, spent)
       VALUES ${values.join(',')}
       ON CONFLICT (txid, vout) DO NOTHING`,
      params
    );
    for (const r of newRows) {
      if (r.address) {
        await upsertAddressStats(r.address, { addReceived: r.value_satoshi, height: r.block_height }, client);
      }
    }
  });
}

// ─── Nickname DB Functions ───

export async function upsertNickname({ opType, nickname, ownerPubKey, payoutAddress, newOwnerPubKey, txid, height }, dbClient = null) {
  return withClient(dbClient, async (client) => {
    const now = Math.floor(Date.now() / 1000);

    switch (opType) {
      case 1: { // REGISTER
        // Check if already registered and still active
        const existing = await client.query(
          "SELECT status FROM nicknames WHERE nickname = $1", [nickname]
        );
        if (existing.rows.length > 0 && ['ACTIVE', 'EXPIRED_GRACE'].includes(existing.rows[0].status)) {
          return; // Already registered, skip
        }

        await client.query(`
          INSERT INTO nicknames (nickname, owner_pubkey, payout_address,
            registration_height, active_until_height, grace_until_height,
            bond_amount_satoshi, last_update_txid, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'ACTIVE', $8, $8)
          ON CONFLICT (nickname) DO UPDATE SET
            owner_pubkey = EXCLUDED.owner_pubkey,
            payout_address = EXCLUDED.payout_address,
            registration_height = EXCLUDED.registration_height,
            active_until_height = EXCLUDED.active_until_height,
            grace_until_height = EXCLUDED.grace_until_height,
            bond_amount_satoshi = EXCLUDED.bond_amount_satoshi,
            last_update_txid = EXCLUDED.last_update_txid,
            status = 'ACTIVE',
            released = FALSE,
            bond_claimed = FALSE,
            updated_at = EXCLUDED.updated_at
        `, [nickname, ownerPubKey, payoutAddress,
            height, height + 144000, height + 144000 + 14400,
            txid, now]);
        break;
      }

      case 2: // UPDATE
        await client.query(`
          UPDATE nicknames SET
            payout_address = $1,
            last_update_txid = $2,
            updated_at = $3
          WHERE nickname = $4
        `, [payoutAddress, txid, now, nickname]);
        break;

      case 3: // TRANSFER
        await client.query(`
          UPDATE nicknames SET
            owner_pubkey = $1,
            last_update_txid = $2,
            updated_at = $3
          WHERE nickname = $4
        `, [newOwnerPubKey, txid, now, nickname]);
        break;

      case 4: // RENEW
        await client.query(`
          UPDATE nicknames SET
            active_until_height = active_until_height + 144000,
            grace_until_height = grace_until_height + 144000,
            last_update_txid = $1,
            updated_at = $2
          WHERE nickname = $3
        `, [txid, now, nickname]);
        break;

      case 5: // RELEASE
        await client.query(`
          UPDATE nicknames SET
            released = TRUE,
            status = 'RELEASED',
            last_update_txid = $1,
            updated_at = $2
          WHERE nickname = $3
        `, [txid, now, nickname]);
        break;

      case 6: // CLAIM_BOND
        await client.query(`
          UPDATE nicknames SET
            bond_claimed = TRUE,
            last_update_txid = $1,
            updated_at = $2
          WHERE nickname = $3
        `, [txid, now, nickname]);
        break;
    }
  });
}

export async function updateNicknameStatuses(height, dbClient = null) {
  return withClient(dbClient, async (client) => {
    // ACTIVE → EXPIRED_GRACE
    await client.query(
      "UPDATE nicknames SET status = 'EXPIRED_GRACE' WHERE status = 'ACTIVE' AND active_until_height < $1",
      [height]
    );
    // EXPIRED_GRACE → BOND_CLAIMABLE (not released, bond not claimed)
    await client.query(
      "UPDATE nicknames SET status = 'BOND_CLAIMABLE' WHERE status = 'EXPIRED_GRACE' AND grace_until_height < $1 AND released = FALSE AND bond_claimed = FALSE",
      [height]
    );
    // EXPIRED_GRACE → EXPIRED_AVAILABLE (bond already claimed)
    await client.query(
      "UPDATE nicknames SET status = 'EXPIRED_AVAILABLE' WHERE status = 'EXPIRED_GRACE' AND grace_until_height < $1 AND bond_claimed = TRUE",
      [height]
    );
    // BOND_CLAIMABLE → EXPIRED_AVAILABLE (after bond is claimed)
    await client.query(
      "UPDATE nicknames SET status = 'EXPIRED_AVAILABLE' WHERE status = 'BOND_CLAIMABLE' AND bond_claimed = TRUE",
      [height]
    );
  });
}

export async function getNicknameByName(name, dbClient = null) {
  return withClient(dbClient, async (client) => {
    const { rows } = await client.query('SELECT * FROM nicknames WHERE nickname = $1', [name]);
    return rows[0] || null;
  });
}

export async function listNicknamesFromDb(start = '', limit = 50, dbClient = null) {
  return withClient(dbClient, async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM nicknames WHERE nickname >= $1 ORDER BY nickname LIMIT $2',
      [start, limit]
    );
    return rows;
  });
}

export default { getPool, initSchema, getTipHeight, upsertAddressStats, markOutputSpent, insertOutput, insertTransaction, insertBlock, insertTransactionsBulk, insertOutputsBulk, getWatchedAddresses, upsertReceivedInscription, updateInscriptionOwner, getInscriptionByOrdId, upsertNickname, updateNicknameStatuses, getNicknameByName, listNicknamesFromDb };