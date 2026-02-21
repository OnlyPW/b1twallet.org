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

    // Inscriptions (ordinals created through the wallet)
    await client.query(`
      CREATE TABLE IF NOT EXISTS inscriptions (
        inscription_txid TEXT PRIMARY KEY,
        owner_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        content_type TEXT NOT NULL,
        data_size INTEGER NOT NULL,
        content BYTEA,
        total_transactions INTEGER DEFAULT 1,
        created_at BIGINT,
        utxo_txid TEXT,
        utxo_vout INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_inscriptions_owner ON inscriptions(owner_address);
      CREATE INDEX IF NOT EXISTS idx_inscriptions_to ON inscriptions(to_address);
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
    const { rows } = await client.query('SELECT address, value_satoshi FROM outputs WHERE txid=$1 AND vout=$2', [prevTxid, prevVout]);
    if (rows.length === 0) return;
    const { address, value_satoshi } = rows[0];
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

/** Bulk-Insert für Indexer: viele Transaktionen in einem Statement (weniger DB-Roundtrips). */
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

/** Bulk-Insert für Indexer: viele Outputs in einem Statement. */
export async function insertOutputsBulk(rows, dbClient = null) {
  if (!rows.length) return;
  return withClient(dbClient, async (client) => {
    const values = [];
    const params = [];
    let i = 1;
    for (const r of rows) {
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
    for (const r of rows) {
      if (r.address) {
        await upsertAddressStats(r.address, { addReceived: r.value_satoshi, height: r.block_height }, client);
      }
    }
  });
}

export default { getPool, initSchema, getTipHeight, upsertAddressStats, markOutputSpent, insertOutput, insertTransaction, insertBlock, insertTransactionsBulk, insertOutputsBulk };