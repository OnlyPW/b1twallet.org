import { getPool } from './db.js';

export async function getAddressBalance(address) {
  const { rows } = await getPool().query(
    `SELECT balance_satoshi, received_satoshi, sent_satoshi FROM addresses WHERE address=$1`,
    [address]
  );
  if (rows.length === 0) {
    return { balance: 0, received: 0, sent: 0 };
  }
  const { balance_satoshi, received_satoshi, sent_satoshi } = rows[0];
  return {
    balance: Number(balance_satoshi) / 100000000,
    received: Number(received_satoshi) / 100000000,
    sent: Number(sent_satoshi) / 100000000,
  };
}

export async function getAddressUtxos(address) {
  const { rows } = await getPool().query(
    `SELECT txid, vout, value_satoshi AS satoshis, block_height AS height, script_pub_key AS scriptPubKey
     FROM outputs WHERE address=$1 AND spent=FALSE ORDER BY block_height DESC NULLS LAST`,
    [address]
  );
  return rows.map(r => ({
    txid: r.txid,
    outputIndex: Number(r.vout),
    satoshis: Number(r.satoshis),
    height: r.height,
    scriptPubKey: r.scriptpubkey || r.scriptPubKey // Handle both possible column names
  }));
}

export async function getAddressTransactions(address, start = 0, limit = 10) {
  // Eingehend: outputs mit address
  // Ausgehend: outputs derselben address, die später spent wurden (spent_txid)
  const client = await getPool().connect();
  try {
    const inbound = await client.query(
      `SELECT o.txid, t.block_height, t.time, TRUE AS inbound
       FROM outputs o
       JOIN transactions t ON t.txid = o.txid
       WHERE o.address=$1
       ORDER BY t.block_height DESC NULLS LAST, t.time DESC NULLS LAST
       OFFSET $2 LIMIT $3`,
      [address, start, limit]
    );

    const outbound = await client.query(
      `SELECT o.spent_txid AS txid, o.spent_block_height AS block_height, t.time, FALSE AS inbound
       FROM outputs o
       LEFT JOIN transactions t ON t.txid = o.spent_txid
       WHERE o.address=$1 AND o.spent=TRUE
       ORDER BY o.spent_block_height DESC NULLS LAST, t.time DESC NULLS LAST
       OFFSET $2 LIMIT $3`,
      [address, start, limit]
    );

    // Merge and deduplicate by txid with latest block_height
    const map = new Map();
    for (const row of [...inbound.rows, ...outbound.rows]) {
      if (!row.txid) continue;
      const existing = map.get(row.txid);
      if (!existing || (row.block_height || 0) > (existing.block_height || 0)) {
        map.set(row.txid, row);
      }
    }
    return Array.from(map.values());
  } finally {
    client.release();
  }
}

export default { getAddressBalance, getAddressUtxos, getAddressTransactions };