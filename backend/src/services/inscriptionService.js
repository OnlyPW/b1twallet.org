import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const dogecore = require('../lib/bitcore-lib-b1t');
const { PrivateKey, Address, Transaction, Script, Opcode } = dogecore;
const { Hash, Signature } = dogecore.crypto;

Transaction.FEE_PER_KB = parseInt(process.env.FEE_PER_KB || '5625000');

const MAX_SCRIPT_ELEMENT_SIZE = 520;
const MAX_CHUNK_LEN = 240;
const MAX_PAYLOAD_LEN = 1500;

const FEE_ADDRESS = 'BEXdSu9cC67u8qA7eFUVBveQNReMcXh4X5';
const MIN_FEE = 2000000; // 0.02 B1T minimum transaction fee

function bufferToChunk(b, type) {
  b = Buffer.from(b, type);
  return {
    buf: b.length ? b : undefined,
    len: b.length,
    opcodenum: b.length <= 75 ? b.length : b.length <= 255 ? 76 : 77
  };
}

function numberToChunk(n) {
  return {
    buf: n <= 16 ? undefined : n < 128 ? Buffer.from([n]) : Buffer.from([n % 256, Math.floor(n / 256)]),
    len: n <= 16 ? 0 : n < 128 ? 1 : 2,
    opcodenum: n === 0 ? 0 : n <= 16 ? 80 + n : n < 128 ? 1 : 2
  };
}

function opcodeToChunk(op) {
  return { opcodenum: op };
}

function fund(wallet, tx) {
  tx.change(wallet.address);
  delete tx._fee;

  const effectiveFee = Math.max(tx.getFee(), MIN_FEE);
  tx.fee(effectiveFee);

  if (tx.inputs.length && tx.outputs.length && tx.inputAmount >= tx.outputAmount + effectiveFee) {
    tx.sign(wallet.privkey);
    return;
  }

  // Sort UTXOs largest-first and keep adding until funded
  const sorted = [...wallet.utxos].sort((a, b) => b.satoshis - a.satoshis);
  const usedTxids = new Set(tx.inputs.map(i => i.prevTxId.toString('hex') + ':' + i.outputIndex));

  for (const utxo of sorted) {
    const key = utxo.txid + ':' + utxo.vout;
    if (usedTxids.has(key)) continue;

    delete tx._fee;
    tx.from(utxo);
    tx.change(wallet.address);

    const newFee = Math.max(tx.getFee(), MIN_FEE);
    tx.fee(newFee);

    if (tx.inputAmount >= tx.outputAmount + newFee) {
      tx.sign(wallet.privkey);
      return;
    }
    usedTxids.add(key);
  }

  throw new Error('Not enough funds.');
}

function updateWallet(wallet, tx) {
  wallet.utxos = wallet.utxos.filter(utxo => {
    for (const input of tx.inputs) {
      if (input.prevTxId.toString('hex') === utxo.txid && input.outputIndex === utxo.vout) {
        return false;
      }
    }
    return true;
  });

  tx.outputs.forEach((output, vout) => {
    if (output.script.toAddress().toString() === wallet.address) {
      wallet.utxos.push({
        txid: tx.hash,
        vout,
        script: output.script.toHex(),
        satoshis: output.satoshis
      });
    }
  });
}

/**
 * Creates an inscription transaction chain.
 *
 * @param {string} privateKeyWIF - WIF-encoded private key
 * @param {string} senderAddress - Address that owns the UTXOs
 * @param {string} toAddress - Destination address for the inscription
 * @param {string} contentType - MIME type (e.g. "image/webp")
 * @param {Buffer} data - Raw inscription data
 * @param {Array} utxos - Array of { txid, vout, script, satoshis }
 * @param {string|null} mintAddress - Optional mint payment address
 * @param {number|null} mintPrice - Optional mint price in satoshis
 * @returns {Array} Array of { txid, hex } for each transaction in the chain
 */
export function createInscription(privateKeyWIF, senderAddress, toAddress, contentType, data, utxos, mintAddress = null, mintPrice = null) {
  if (!data || data.length === 0) {
    throw new Error('No data to inscribe.');
  }
  if (contentType.length > MAX_SCRIPT_ELEMENT_SIZE) {
    throw new Error('Content type too long.');
  }

  const address = new Address(toAddress);
  const wallet = {
    privkey: privateKeyWIF,
    address: senderAddress,
    utxos: utxos.map(u => ({
      txid: u.txid,
      vout: u.vout,
      script: u.script,
      satoshis: u.satoshis
    }))
  };

  const txs = inscribe(wallet, address, contentType, data, mintAddress, mintPrice);

  return txs.map((tx, index) => ({
    transactionNumber: index + 1,
    txid: tx.hash,
    hex: tx.toString()
  }));
}

function inscribe(wallet, address, contentType, data, mintAddress, mintPrice) {
  let txs = [];
  let privateKey = new PrivateKey(wallet.privkey);
  let publicKey = privateKey.toPublicKey();
  let parts = [];
  let inscription = new Script();

  while (data.length) {
    let part = data.slice(0, Math.min(MAX_CHUNK_LEN, data.length));
    data = data.slice(part.length);
    parts.push(part);
  }

  inscription.chunks.push(bufferToChunk('ord'));
  inscription.chunks.push(numberToChunk(parts.length));
  inscription.chunks.push(bufferToChunk(contentType));
  parts.forEach((part, n) => {
    inscription.chunks.push(numberToChunk(parts.length - n - 1));
    inscription.chunks.push(bufferToChunk(part));
  });

  let p2shInput;
  let lastLock;
  let lastPartial;

  while (inscription.chunks.length) {
    let partial = new Script();

    if (txs.length === 0) {
      partial.chunks.push(inscription.chunks.shift());
    }

    while (partial.toBuffer().length <= MAX_PAYLOAD_LEN && inscription.chunks.length) {
      partial.chunks.push(inscription.chunks.shift());
      if (inscription.chunks.length === 0) break;
      partial.chunks.push(inscription.chunks.shift());
    }

    if (partial.toBuffer().length > MAX_PAYLOAD_LEN) {
      inscription.chunks.unshift(partial.chunks.pop());
      inscription.chunks.unshift(partial.chunks.pop());
    }

    let lock = new Script();
    lock.chunks.push(bufferToChunk(publicKey.toBuffer()));
    lock.chunks.push(opcodeToChunk(Opcode.OP_CHECKSIGVERIFY));
    partial.chunks.forEach(() => {
      lock.chunks.push(opcodeToChunk(Opcode.OP_DROP));
    });
    lock.chunks.push(opcodeToChunk(Opcode.OP_TRUE));

    let lockhash = Hash.ripemd160(Hash.sha256(lock.toBuffer()));

    let p2sh = new Script();
    p2sh.chunks.push(opcodeToChunk(Opcode.OP_HASH160));
    p2sh.chunks.push(bufferToChunk(lockhash));
    p2sh.chunks.push(opcodeToChunk(Opcode.OP_EQUAL));

    let p2shOutput = new Transaction.Output({
      script: p2sh,
      satoshis: 100000
    });

    let tx = new Transaction();
    if (p2shInput) tx.addInput(p2shInput);
    tx.addOutput(p2shOutput);
    fund(wallet, tx);

    if (p2shInput) {
      let signature = Transaction.sighash.sign(tx, privateKey, Signature.SIGHASH_ALL, 0, lastLock);
      let txsignature = Buffer.concat([signature.toBuffer(), Buffer.from([Signature.SIGHASH_ALL])]);

      let unlock = new Script();
      unlock.chunks = unlock.chunks.concat(lastPartial.chunks);
      unlock.chunks.push(bufferToChunk(txsignature));
      unlock.chunks.push(bufferToChunk(lastLock.toBuffer()));
      tx.inputs[0].setScript(unlock);
    }

    updateWallet(wallet, tx);
    txs.push(tx);

    if (tx.outputs.length > 0) {
      p2shInput = new Transaction.Input({
        prevTxId: tx.hash,
        outputIndex: 0,
        output: tx.outputs[0],
        script: ''
      });

      p2shInput.clearSignatures = () => {};
      p2shInput.getSignatures = () => {};
    } else {
      break;
    }

    lastLock = lock;
    lastPartial = partial;
  }

  let finalTx = new Transaction();
  if (p2shInput) {
    finalTx.addInput(p2shInput);
    finalTx.to(address, 100000);
    if (mintAddress && mintPrice) {
      finalTx.to(mintAddress, mintPrice);
    }

    const platformFee = txs.length * 10000000; // 0.1 B1T per transaction
    finalTx.to(FEE_ADDRESS, platformFee);

    fund(wallet, finalTx);

    let signature = Transaction.sighash.sign(finalTx, privateKey, Signature.SIGHASH_ALL, 0, lastLock);
    let txsignature = Buffer.concat([signature.toBuffer(), Buffer.from([Signature.SIGHASH_ALL])]);

    let unlock = new Script();
    unlock.chunks = unlock.chunks.concat(lastPartial.chunks);
    unlock.chunks.push(bufferToChunk(txsignature));
    unlock.chunks.push(bufferToChunk(lastLock.toBuffer()));
    finalTx.inputs[0].setScript(unlock);

    updateWallet(wallet, finalTx);
    txs.push(finalTx);
  }

  return txs;
}

/**
 * Estimates the number of transactions needed and the approximate cost.
 */
export function estimateInscriptionCost(dataSize) {
  const chunks = Math.ceil(dataSize / MAX_CHUNK_LEN);
  const payloadChunks = Math.ceil((chunks * (MAX_CHUNK_LEN + 4) + 10) / MAX_PAYLOAD_LEN);
  const txCount = payloadChunks + 1;
  const perTxFee = Math.max(Math.ceil(Transaction.FEE_PER_KB * 0.3), MIN_FEE);
  const p2shOutputs = payloadChunks * 100000;
  const inscriptionOutput = 100000;
  const platformFee = txCount * 10000000; // 0.1 B1T per tx
  const totalEstimate = (txCount * perTxFee) + p2shOutputs + inscriptionOutput + platformFee;

  return {
    estimatedTransactions: txCount,
    estimatedCostSatoshis: totalEstimate,
    estimatedCostB1T: totalEstimate / 100000000,
    platformFeeSatoshis: platformFee,
    platformFeeB1T: platformFee / 100000000,
  };
}
