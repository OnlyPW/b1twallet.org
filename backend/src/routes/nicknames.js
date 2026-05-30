import express from 'express';
import rpcClient from '../services/rpcClient.js';
import { getPool, getTipHeight } from '../services/db.js';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const router = express.Router();
const ECPair = ECPairFactory(ecc);

// B1T Network Parameters (chainparams.cpp)
const B1T_NETWORK = {
    messagePrefix: '\x18Bit Signed Message:\n',
    bech32: 'bc',
    bip32: { public: 0x02FACAFD, private: 0x02FAC398 },
    pubKeyHash: 0x19,
    scriptHash: 0x16,
    wif: 0x9E,
};

// ─── Constants from Core (nicknames.h / nicknameop.cpp / chainparams.cpp) ───
const NICKNAME_ACTIVATION_HEIGHT = 400000;
const ACTIVE_BLOCKS = 144000;
const GRACE_BLOCKS = 14400;
const BIT_NICKNAME_MAGIC = Buffer.from([0x42, 0x49, 0x54, 0x31]); // "BIT1"
const DEST_PKH = 0x01;
const DEST_SH = 0x02;
const COIN = 100000000;
const DUST = 546;
const DEFAULT_MIN_FEE_BIT = 0.0001;

const OP = {
    REGISTER: 1,
    UPDATE: 2,
    TRANSFER: 3,
    RENEW: 4,
    RELEASE: 5,
    CLAIM_BOND: 6,
};

// ═══════════════════════════════════════════════════════
// LOW-LEVEL ENCODING (must match Core serialization exactly)
// ═══════════════════════════════════════════════════════

// CompactSize / VarInt as used by Bitcoin's CDataStream operator<<
function writeCompactSize(value) {
    if (value < 253) return Buffer.from([value]);
    if (value <= 0xFFFF) {
        const buf = Buffer.alloc(3);
        buf[0] = 253;
        buf.writeUInt16LE(value, 1);
        return buf;
    }
    const buf = Buffer.alloc(5);
    buf[0] = 254;
    buf.writeUInt32LE(value, 1);
    return buf;
}

// Encode a base58 address into the 21-byte compact destination (type + hash160)
function encodeDestinationBytes(address) {
    const decoded = bitcoin.address.fromBase58Check(address);
    const version = decoded.version;
    const hash = decoded.hash;

    if (version === B1T_NETWORK.pubKeyHash) {
        return Buffer.concat([Buffer.from([DEST_PKH]), hash]);
    }
    if (version === B1T_NETWORK.scriptHash) {
        return Buffer.concat([Buffer.from([DEST_SH]), hash]);
    }
    throw new Error('Unsupported payout address type');
}

// Build the OP_RETURN payload for a nickname operation (without the OP_RETURN/pushdata wrapper)
function buildNicknameOpPayload(opType, nickname, options = {}) {
    const normalized = nickname.toLowerCase();
    const nameBytes = Buffer.from(normalized, 'utf8');

    const parts = [
        BIT_NICKNAME_MAGIC,
        Buffer.from([opType]),
        writeCompactSize(nameBytes.length),
        nameBytes,
    ];

    switch (opType) {
        case OP.REGISTER: {
            if (!options.ownerPubKey || !options.payoutAddress) {
                throw new Error('REGISTER requires ownerPubKey and payoutAddress');
            }
            const pubKeyBuf = Buffer.from(options.ownerPubKey, 'hex');
            if (pubKeyBuf.length !== 33) throw new Error('Owner pubkey must be 33 bytes');
            const destBytes = encodeDestinationBytes(options.payoutAddress);
            parts.push(writeCompactSize(33));
            parts.push(pubKeyBuf);
            parts.push(writeCompactSize(21));
            parts.push(destBytes);
            break;
        }
        case OP.UPDATE: {
            if (!options.payoutAddress) throw new Error('UPDATE requires payoutAddress');
            const destBytes = encodeDestinationBytes(options.payoutAddress);
            parts.push(writeCompactSize(21));
            parts.push(destBytes);
            break;
        }
        case OP.TRANSFER: {
            if (!options.newOwnerPubKey) throw new Error('TRANSFER requires newOwnerPubKey');
            const pubKeyBuf = Buffer.from(options.newOwnerPubKey, 'hex');
            if (pubKeyBuf.length !== 33) throw new Error('New owner pubkey must be 33 bytes');
            parts.push(writeCompactSize(33));
            parts.push(pubKeyBuf);
            break;
        }
        case OP.RENEW:
        case OP.RELEASE:
        case OP.CLAIM_BOND:
            break;
        default:
            throw new Error('Unknown op type');
    }

    return Buffer.concat(parts);
}

// Wrap a payload in a standard OP_RETURN script.
// Uses bitcoin.script.compile so payloads >= 76 bytes get OP_PUSHDATA1 (Core uses CScript() << OP_RETURN << raw).
function opReturnScript(payload) {
    return bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, payload]);
}

// P2PK script: <33-byte pubkey> OP_CHECKSIG  (Core bond output = GetScriptForRawPubKey)
function p2pkScript(pubKeyHex) {
    const pubKeyBuf = Buffer.from(pubKeyHex, 'hex');
    if (pubKeyBuf.length !== 33) throw new Error('P2PK pubkey must be 33 bytes');
    return Buffer.concat([Buffer.from([33]), pubKeyBuf, Buffer.from([0xac])]);
}

function p2pkScriptHex(pubKeyHex) {
    return p2pkScript(pubKeyHex).toString('hex');
}

// ─── Helper: Build BMEM1 memo payload (optional send-with-memo overlay) ───
function buildMemoPayload(data, type = 'utf8') {
    const typeMap = { 'numeric': 0x01, 'alnum': 0x02, 'utf8': 0x03 };
    const typeByte = typeMap[type];
    if (!typeByte) throw new Error('Invalid memo type');

    const dataBuf = Buffer.from(data, 'utf8');
    if (dataBuf.length > 48) throw new Error('Memo too long (max 48 bytes)');

    const magic = Buffer.from([0x42, 0x4D, 0x45, 0x4D, 0x31]); // "BMEM1"
    const header = Buffer.concat([
        magic,
        Buffer.from([0x01, typeByte, dataBuf.length]),
        dataBuf,
    ]);

    // CRC16-CCITT
    let crc = 0xFFFF;
    for (const byte of header) {
        crc ^= byte << 8;
        for (let i = 0; i < 8; i++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
        }
    }

    return Buffer.concat([header, Buffer.from([(crc >> 8) & 0xFF, crc & 0xFF])]);
}

// ─── Helper: Parse nickname OP_RETURN from a scriptPubKey hex (used by the indexer) ───
function parseNicknameOpFromHex(scriptHex) {
    try {
        const scriptBuf = Buffer.from(scriptHex, 'hex');
        if (scriptBuf[0] !== 0x6a) return null; // OP_RETURN

        let offset = 1;
        if (scriptBuf[offset] < 0x4c) {
            offset += 1;
        } else if (scriptBuf[offset] === 0x4c) {
            offset += 2; // OP_PUSHDATA1 + length byte
        } else {
            return null;
        }

        const payload = scriptBuf.slice(offset);
        if (payload.length < 6) return null;
        if (!payload.slice(0, 4).equals(BIT_NICKNAME_MAGIC)) return null;

        const opType = payload[4];
        let pos = 5;

        let nameLen = payload[pos];
        let nameLenBytes = 1;
        if (nameLen === 253) {
            nameLen = payload.readUInt16LE(pos + 1);
            nameLenBytes = 3;
        }
        pos += nameLenBytes;

        const name = payload.slice(pos, pos + nameLen).toString('utf8').toLowerCase();
        pos += nameLen;

        const result = { opType, nickname: name };

        switch (opType) {
            case OP.REGISTER: {
                let pkLen = payload[pos];
                let pkLenBytes = 1;
                if (pkLen === 253) { pkLen = payload.readUInt16LE(pos + 1); pkLenBytes = 3; }
                pos += pkLenBytes;
                result.ownerPubKey = payload.slice(pos, pos + pkLen).toString('hex');
                pos += pkLen;
                let destLen = payload[pos];
                let destLenBytes = 1;
                if (destLen === 253) { destLen = payload.readUInt16LE(pos + 1); destLenBytes = 3; }
                pos += destLenBytes;
                const destType = payload[pos];
                const addrHash = payload.slice(pos + 1, pos + destLen);
                const version = destType === DEST_PKH ? B1T_NETWORK.pubKeyHash : B1T_NETWORK.scriptHash;
                result.payoutAddress = bitcoin.address.toBase58Check(addrHash, version);
                break;
            }
            case OP.UPDATE: {
                let destLen = payload[pos];
                let destLenBytes = 1;
                if (destLen === 253) { destLen = payload.readUInt16LE(pos + 1); destLenBytes = 3; }
                pos += destLenBytes;
                const destType = payload[pos];
                const addrHash = payload.slice(pos + 1, pos + destLen);
                const version = destType === DEST_PKH ? B1T_NETWORK.pubKeyHash : B1T_NETWORK.scriptHash;
                result.payoutAddress = bitcoin.address.toBase58Check(addrHash, version);
                break;
            }
            case OP.TRANSFER: {
                let pkLen = payload[pos];
                let pkLenBytes = 1;
                if (pkLen === 253) { pkLen = payload.readUInt16LE(pos + 1); pkLenBytes = 3; }
                pos += pkLenBytes;
                result.newOwnerPubKey = payload.slice(pos, pos + pkLen).toString('hex');
                break;
            }
            case OP.RENEW:
            case OP.RELEASE:
            case OP.CLAIM_BOND:
                break;
            default:
                return null;
        }

        return result;
    } catch (e) {
        return null;
    }
}

// Find the bond output (P2PK to the given owner pubkey) in a decoded transaction.
// Returns { vout, satoshis } or null. Used by the indexer to track the bond UTXO.
function findBondOutput(tx, ownerPubKeyHex) {
    if (!ownerPubKeyHex) return null;
    const wantHex = p2pkScriptHex(ownerPubKeyHex);
    for (const vout of tx.vout || []) {
        const spkHex = vout.scriptPubKey?.hex;
        if (spkHex && spkHex.toLowerCase() === wantHex) {
            return { vout: vout.n, satoshis: Math.round((vout.value || 0) * COIN) };
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════
// VALIDATION / PRICING (mirrors nicknames.cpp)
// ═══════════════════════════════════════════════════════

function normalizeName(input) {
    let name = String(input || '').trim().toLowerCase();
    if (name.startsWith('@')) name = name.slice(1);
    return name;
}

function validateNameLocal(name) {
    const MIN_LEN = 4, MAX_LEN = 16;
    if (name.length < MIN_LEN || name.length > MAX_LEN) {
        return { valid: false, reason: `Length must be ${MIN_LEN}-${MAX_LEN} characters` };
    }
    if (name.startsWith('_') || name.endsWith('_')) {
        return { valid: false, reason: 'Cannot start or end with underscore' };
    }
    if (name.includes('__')) {
        return { valid: false, reason: 'No consecutive underscores' };
    }
    if (/[^a-z0-9_]/.test(name)) {
        return { valid: false, reason: 'Only lowercase letters, digits and underscores' };
    }
    if (!/[a-z]/.test(name)) {
        return { valid: false, reason: 'Must contain at least one letter' };
    }
    return { valid: true };
}

// Base pricing in COIN units (GetBasePricing in nicknames.cpp), multiplier permille applied
function getLocalPricing(length, multiplierPermille = 1000) {
    const base = {
        4: { registrationFee: 24, bondAmount: 48 },
        5: { registrationFee: 12, bondAmount: 24 },
        6: { registrationFee: 6, bondAmount: 12 },
        7: { registrationFee: 3, bondAmount: 6 },
    }[length] || { registrationFee: 1, bondAmount: 3 };

    const m = Math.min(Math.max(multiplierPermille, 500), 3000);
    const scale = (v) => Math.round((v * COIN * m + 500) / 1000) / COIN; // nearest, COIN-fixed-point
    const registrationFee = scale(base.registrationFee);
    const bondAmount = scale(base.bondAmount);
    const renewalFee = Math.round(registrationFee * 25 / 100 * COIN) / COIN;
    return {
        registrationFee,
        bondAmount,
        renewalFee,
        renewalBondIncrease: renewalFee,
    };
}

// Authoritative pricing: prefer Core RPC checknickname, fall back to local table.
async function getPricing(name) {
    try {
        const r = await rpcClient.call('checknickname', [name]);
        if (r && typeof r.bond_amount !== 'undefined') {
            return {
                source: 'rpc',
                valid: r.valid !== false,
                reason: r.reason || '',
                normalized: r.normalized || name,
                registrationFee: Number(r.registration_fee),
                bondAmount: Number(r.bond_amount),
                renewalFee: Number(r.renewal_fee),
                renewalBondIncrease: typeof r.renewal_bond_increase !== 'undefined'
                    ? Number(r.renewal_bond_increase)
                    : Number(r.renewal_fee),
                pricingMultiplierPermille: r.pricing_multiplier_permille,
                activeBlocks: r.active_blocks || ACTIVE_BLOCKS,
                graceBlocks: r.grace_blocks || GRACE_BLOCKS,
            };
        }
    } catch (e) { /* fall through to local */ }
    return { source: 'local', valid: true, normalized: name, ...getLocalPricing(name.length) };
}

// ═══════════════════════════════════════════════════════
// FEE / UTXO HELPERS
// ═══════════════════════════════════════════════════════

async function getFeeContext() {
    let minFeeBit = DEFAULT_MIN_FEE_BIT;
    try {
        const [mempool, network] = await Promise.all([
            rpcClient.getMempoolInfo().catch(() => null),
            rpcClient.getNetworkInfo().catch(() => null),
        ]);
        const relay = (network && typeof network.relayfee === 'number') ? network.relayfee : DEFAULT_MIN_FEE_BIT;
        const dynMin = (mempool && typeof mempool.mempoolminfee === 'number') ? mempool.mempoolminfee : 0;
        minFeeBit = Math.max(relay, dynMin, DEFAULT_MIN_FEE_BIT);
    } catch { }
    const minSats = Math.round(minFeeBit * COIN);
    const ratePerByte = Math.max(10, Math.ceil((minFeeBit * COIN) / 1000));
    return { minSats, ratePerByte };
}

function estimateVsize(numInputs, numOutputs, payloadLen) {
    // ~148 bytes per P2PKH/P2PK input, ~34 per output, ~10 overhead, + OP_RETURN payload
    return numInputs * 148 + numOutputs * 34 + 10 + payloadLen + 12;
}

function feeForSize(numInputs, numOutputs, payloadLen, feeCtx) {
    return Math.max(Math.ceil(estimateVsize(numInputs, numOutputs, payloadLen) * feeCtx.ratePerByte), feeCtx.minSats);
}

// Get spendable P2PKH UTXOs for an address (largest first). Bond P2PK UTXOs never appear here
// because they have no standard address and are not returned by scantxoutset addr() queries.
async function getSpendableUtxos(address) {
    const utxos = await rpcClient.getAddressUtxos(address);
    if (!Array.isArray(utxos)) return [];
    return utxos
        .filter(u => Number(u.satoshis) > 0)
        .sort((a, b) => b.satoshis - a.satoshis);
}

// Resolve the current bond outpoint of a nickname from the authoritative Core index (RPC),
// falling back to the local DB. Returns { txid, vout, amountSat, ownerPubKey, status } or null.
async function getNicknameState(name) {
    try {
        const info = await rpcClient.call('getnicknameinfo', [name]);
        if (info && info.nickname) {
            return {
                source: 'rpc',
                nickname: info.nickname,
                status: info.status,
                ownerPubKey: info.owner_pubkey,
                payoutAddress: info.payout_address,
                bondTxid: info.bond_txid || null,
                bondVout: (typeof info.bond_vout !== 'undefined') ? info.bond_vout : null,
                bondAmountSat: Math.round(Number(info.bond_amount || 0) * COIN),
                activeUntil: info.active_until,
                graceUntil: info.grace_until,
                claimableBond: info.claimable_bond === true || info.status === 'BOND_CLAIMABLE',
            };
        }
    } catch (e) { /* fall through to DB */ }

    try {
        const pool = getPool();
        const { rows } = await pool.query('SELECT * FROM nicknames WHERE nickname = $1', [name]);
        if (rows.length > 0) {
            const r = rows[0];
            return {
                source: 'db',
                nickname: r.nickname,
                status: r.status,
                ownerPubKey: r.owner_pubkey,
                payoutAddress: r.payout_address,
                bondTxid: r.bond_txid || null,
                bondVout: (r.bond_vout !== null && typeof r.bond_vout !== 'undefined') ? r.bond_vout : null,
                bondAmountSat: Number(r.bond_amount_satoshi || 0),
                activeUntil: r.active_until_height,
                graceUntil: r.grace_until_height,
                claimableBond: r.status === 'BOND_CLAIMABLE',
            };
        }
    } catch (e) { /* ignore */ }

    return null;
}

async function fetchPrevTxHex(txid) {
    return rpcClient.call('getrawtransaction', [txid], 10000);
}

// ═══════════════════════════════════════════════════════
// UNIFIED NICKNAME TRANSACTION BUILDER
// ═══════════════════════════════════════════════════════
//
// Builds, signs and broadcasts a consensus-valid nickname transaction.
//
//   keyPair          ECPair of the owner (signs both P2PK bond input and P2PKH funding inputs)
//   ownerAddress     P2PKH address of keyPair (funding + change + owner-authorization input)
//   payload          OP_RETURN payload buffer
//   bondInput        { txid, vout, amountSat } | null   (existing bond to spend: renew/transfer/claim)
//   createdOutputs   [{ script: Buffer, value: sats }]  (new bond outputs to create)
//   requiredFeeSats  extra fee that MUST be paid (registration fee, burned as tx fee)
//   claimToChange    if true, leftover (bond minus fee) is sent to ownerAddress as change (claim)
//
async function buildNicknameTransaction({
    keyPair, ownerAddress, payload, bondInput = null,
    createdOutputs = [], requiredFeeSats = 0, claimToChange = false,
}) {
    const feeCtx = await getFeeContext();
    const createdSum = createdOutputs.reduce((s, o) => s + o.value, 0);
    const bondAmt = bondInput ? bondInput.amountSat : 0;

    // Select funding UTXOs from the owner's address to cover created outputs + required fee + network fee.
    const candidates = await getSpendableUtxos(ownerAddress);
    const selected = [];
    let selectedTotal = 0;
    let netFee = 0;
    let fundTarget = 0;
    let satisfied = false;

    // Iterate, adding inputs until the funding target (which depends on the fee, which depends on
    // the number of inputs) is met.
    const computeTargets = () => {
        const numInputs = selected.length + (bondInput ? 1 : 0);
        const numOutputs = createdOutputs.length + 1 /* OP_RETURN */ + 1 /* change */;
        netFee = feeForSize(numInputs, numOutputs, payload.length, feeCtx);
        fundTarget = Math.max(0, createdSum + requiredFeeSats + netFee - bondAmt);
    };

    computeTargets();
    if (fundTarget === 0) {
        satisfied = true; // bond covers everything (e.g. claim_bond)
    }
    for (const u of candidates) {
        if (satisfied) break;
        selected.push(u);
        selectedTotal += u.satoshis;
        computeTargets();
        if (selectedTotal >= fundTarget) satisfied = true;
    }

    if (!satisfied) {
        const err = new Error('Insufficient balance to fund nickname operation');
        err.details = { required: fundTarget / COIN, available: selectedTotal / COIN, networkFee: netFee / COIN };
        throw err;
    }

    // change = inputs - created outputs - burned fee - network fee
    let change = selectedTotal + bondAmt - createdSum - requiredFeeSats - netFee;
    if (change < 0) {
        const err = new Error('Insufficient balance after fees');
        err.details = { shortfall: -change / COIN };
        throw err;
    }

    const psbt = new bitcoin.Psbt({ network: B1T_NETWORK });

    // Bond input first (if any)
    if (bondInput) {
        const hex = await fetchPrevTxHex(bondInput.txid);
        psbt.addInput({ hash: bondInput.txid, index: bondInput.vout, nonWitnessUtxo: Buffer.from(hex, 'hex') });
    }
    // Funding inputs
    for (const u of selected) {
        const hex = await fetchPrevTxHex(u.txid);
        psbt.addInput({ hash: u.txid, index: u.outputIndex, nonWitnessUtxo: Buffer.from(hex, 'hex') });
    }

    // OP_RETURN output (value 0)
    psbt.addOutput({ script: opReturnScript(payload), value: 0 });

    // Created bond outputs
    for (const o of createdOutputs) {
        psbt.addOutput({ script: o.script, value: o.value });
    }

    // Change / claim output
    if (claimToChange) {
        // For claim_bond the entire change IS the reclaimed bond.
        if (change < DUST) {
            throw new Error('Bond amount too small to claim after fees');
        }
        psbt.addOutput({ address: ownerAddress, value: change });
    } else if (change >= DUST) {
        psbt.addOutput({ address: ownerAddress, value: change });
    }

    // Sign every input with the owner key (covers P2PK bond + P2PKH funding)
    const inputCount = (bondInput ? 1 : 0) + selected.length;
    for (let i = 0; i < inputCount; i++) {
        psbt.signInput(i, keyPair);
    }
    psbt.finalizeAllInputs();

    // Pass true to bypass bitcoinjs's max-fee-rate guard: the registration fee is intentionally
    // large (e.g. 24 BIT) and is burned as the tx fee, which the guard would otherwise reject.
    const txHex = psbt.extractTransaction(true).toHex();
    const txid = await rpcClient.sendRawTransaction(txHex);
    return {
        txid,
        fee: (requiredFeeSats + netFee) / COIN,
        networkFee: netFee / COIN,
        change: claimToChange ? 0 : (change >= DUST ? change / COIN : 0),
        inputsUsed: inputCount,
    };
}

// Ensure the wallet key controls the nickname (current owner) before mutating it.
function assertOwnership(state, ownerPubKeyHex, name) {
    if (!state) {
        const e = new Error(`Nickname "${name}" not found`);
        e.status = 404;
        throw e;
    }
    if ((state.ownerPubKey || '').toLowerCase() !== ownerPubKeyHex.toLowerCase()) {
        const e = new Error(`This wallet key does not own "${name}"`);
        e.status = 403;
        throw e;
    }
}

function ownerContextFromWif(wif) {
    const keyPair = ECPair.fromWIF(wif, B1T_NETWORK);
    const ownerPubKey = Buffer.from(keyPair.publicKey).toString('hex');
    const { address: ownerAddress } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network: B1T_NETWORK });
    return { keyPair, ownerPubKey, ownerAddress };
}

// ═══════════════════════════════════════════════════════
// READ ROUTES
// ═══════════════════════════════════════════════════════

// GET /api/nicknames/check/:name
router.get('/check/:name', async (req, res) => {
    try {
        const input = req.params.name;
        if (!input) return res.status(400).json({ success: false, error: 'Name required' });

        const normalized = normalizeName(input);
        const local = validateNameLocal(normalized);
        if (!local.valid) {
            return res.json({ success: true, input, normalized, valid: false, reason: local.reason });
        }

        const pricing = await getPricing(normalized);
        return res.json({
            success: true,
            input,
            normalized: pricing.normalized || normalized,
            valid: pricing.valid !== false,
            reason: pricing.reason || '',
            registration_fee: pricing.registrationFee,
            bond_amount: pricing.bondAmount,
            renewal_fee: pricing.renewalFee,
            renewal_bond_increase: pricing.renewalBondIncrease,
            pricing_multiplier_permille: pricing.pricingMultiplierPermille,
            active_blocks: pricing.activeBlocks || ACTIVE_BLOCKS,
            grace_blocks: pricing.graceBlocks || GRACE_BLOCKS,
            source: pricing.source,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/nicknames/info/:name
router.get('/info/:name', async (req, res) => {
    try {
        const name = normalizeName(req.params.name);
        const state = await getNicknameState(name);
        if (!state) {
            return res.json({ success: true, nickname: name, status: 'NOT_REGISTERED' });
        }
        return res.json({
            success: true,
            nickname: state.nickname,
            status: state.status,
            payout_address: state.payoutAddress,
            owner_pubkey: state.ownerPubKey,
            active_until: state.activeUntil,
            grace_until: state.graceUntil,
            bond_amount: state.bondAmountSat / COIN,
            bond_txid: state.bondTxid,
            bond_vout: state.bondVout,
            claimable_bond: state.claimableBond,
            source: state.source,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/nicknames/resolve/:name
router.get('/resolve/:name', async (req, res) => {
    try {
        const name = normalizeName(req.params.name);

        try {
            const rpcResult = await rpcClient.call('resolvenickname', [name]);
            if (rpcResult && rpcResult.payout_address) {
                return res.json({
                    success: true,
                    nickname: name,
                    payout_address: rpcResult.payout_address,
                    resolves: rpcResult.resolves !== false,
                    status: rpcResult.status,
                });
            }
        } catch (e) { }

        const pool = getPool();
        const { rows } = await pool.query(
            "SELECT payout_address, status FROM nicknames WHERE nickname = $1 AND status = 'ACTIVE'", [name]
        );
        if (rows.length > 0) {
            return res.json({ success: true, nickname: name, payout_address: rows[0].payout_address, resolves: true, status: 'ACTIVE' });
        }
        res.json({ success: true, nickname: name, resolves: false, status: 'NOT_FOUND' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/nicknames/list
router.get('/list', async (req, res) => {
    try {
        const start = normalizeName(req.query.start || '');
        const count = Math.min(parseInt(req.query.count) || 50, 500);

        try {
            const rpcResult = await rpcClient.call('listnicknames', [start, count]);
            if (Array.isArray(rpcResult)) {
                return res.json({ success: true, nicknames: rpcResult, source: 'rpc' });
            }
        } catch (e) { }

        const pool = getPool();
        const { rows } = await pool.query(
            'SELECT * FROM nicknames WHERE nickname >= $1 ORDER BY nickname LIMIT $2', [start, count]
        );
        const nicknames = rows.map(row => ({
            nickname: row.nickname,
            status: row.status,
            payout_address: row.payout_address,
            owner_pubkey: row.owner_pubkey,
            registration_height: row.registration_height,
            active_until: row.active_until_height,
            grace_until: row.grace_until_height,
            bond_amount: row.bond_amount_satoshi ? row.bond_amount_satoshi / COIN : 0,
        }));
        res.json({ success: true, nicknames, source: 'db' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/nicknames/my  { pubkeys: [hex...] }  → names owned by these wallet keys
router.post('/my', async (req, res) => {
    try {
        const pubkeys = Array.isArray(req.body.pubkeys) ? req.body.pubkeys.map(p => String(p).toLowerCase()) : [];
        if (pubkeys.length === 0) {
            return res.status(400).json({ success: false, error: 'pubkeys array required' });
        }

        const pool = getPool();
        const { rows } = await pool.query(
            'SELECT * FROM nicknames WHERE LOWER(owner_pubkey) = ANY($1) ORDER BY nickname', [pubkeys]
        );

        // Enrich each name with authoritative Core state (status/bond/expiry) where available.
        const names = [];
        for (const row of rows) {
            const state = await getNicknameState(row.nickname);
            const src = state || {
                nickname: row.nickname,
                status: row.status,
                ownerPubKey: row.owner_pubkey,
                payoutAddress: row.payout_address,
                bondTxid: row.bond_txid,
                bondVout: row.bond_vout,
                bondAmountSat: Number(row.bond_amount_satoshi || 0),
                activeUntil: row.active_until_height,
                graceUntil: row.grace_until_height,
                claimableBond: row.status === 'BOND_CLAIMABLE',
            };
            // Ownership may have changed (transfer) — only return names still owned by the wallet.
            if (pubkeys.includes((src.ownerPubKey || '').toLowerCase())) {
                names.push({
                    nickname: src.nickname,
                    status: src.status,
                    owner_pubkey: src.ownerPubKey,
                    payout_address: src.payoutAddress,
                    active_until: src.activeUntil,
                    grace_until: src.graceUntil,
                    bond_amount: src.bondAmountSat / COIN,
                    bond_txid: src.bondTxid,
                    bond_vout: src.bondVout,
                    claimable_bond: src.claimableBond,
                });
            }
        }

        res.json({ success: true, nicknames: names });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════
// WRITE ROUTES (build + sign + broadcast)
// ═══════════════════════════════════════════════════════

// POST /api/nicknames/register  { wif, nickname, payoutAddress?, fromAddress? }
router.post('/register', async (req, res) => {
    try {
        const { wif, nickname } = req.body;
        if (!wif || !nickname) {
            return res.status(400).json({ success: false, error: 'Missing required fields (wif, nickname)' });
        }

        const name = normalizeName(nickname);
        const local = validateNameLocal(name);
        if (!local.valid) return res.status(400).json({ success: false, error: local.reason });

        const tipHeight = await getTipHeight().catch(() => 0);
        if (tipHeight && tipHeight < NICKNAME_ACTIVATION_HEIGHT) {
            return res.status(400).json({
                success: false,
                error: `Nickname feature activates at block ${NICKNAME_ACTIVATION_HEIGHT}. Current: ${tipHeight}`,
            });
        }

        // Reject if currently held by someone.
        const existing = await getNicknameState(name);
        if (existing && ['ACTIVE', 'EXPIRED_GRACE'].includes(existing.status)) {
            return res.status(409).json({ success: false, error: `Nickname "${name}" is already registered (${existing.status})` });
        }

        const { keyPair, ownerPubKey, ownerAddress } = ownerContextFromWif(wif);
        const payoutAddress = req.body.payoutAddress || ownerAddress;

        // Validate payout address parses for this network.
        try { bitcoin.address.toOutputScript(payoutAddress, B1T_NETWORK); }
        catch { return res.status(400).json({ success: false, error: 'Invalid payout address' }); }

        const pricing = await getPricing(name);
        const bondSats = Math.round(pricing.bondAmount * COIN);
        const regFeeSats = Math.round(pricing.registrationFee * COIN);

        const payload = buildNicknameOpPayload(OP.REGISTER, name, { ownerPubKey, payoutAddress });

        const result = await buildNicknameTransaction({
            keyPair,
            ownerAddress,
            payload,
            createdOutputs: [{ script: p2pkScript(ownerPubKey), value: bondSats }],
            requiredFeeSats: regFeeSats,
        });

        res.json({
            success: true,
            ...result,
            nickname: name,
            owner_pubkey: ownerPubKey,
            payout_address: payoutAddress,
            bond_amount: bondSats / COIN,
            registration_fee: regFeeSats / COIN,
        });
    } catch (error) {
        console.error('Nickname register error:', error.message, error.details || '');
        res.status(error.status || 500).json({ success: false, error: error.message, ...(error.details ? { details: error.details } : {}) });
    }
});

// POST /api/nicknames/update  { wif, nickname, newPayoutAddress }
router.post('/update', async (req, res) => {
    try {
        const { wif, nickname, newPayoutAddress } = req.body;
        if (!wif || !nickname || !newPayoutAddress) {
            return res.status(400).json({ success: false, error: 'Missing required fields (wif, nickname, newPayoutAddress)' });
        }
        const name = normalizeName(nickname);
        try { bitcoin.address.toOutputScript(newPayoutAddress, B1T_NETWORK); }
        catch { return res.status(400).json({ success: false, error: 'Invalid payout address' }); }

        const { keyPair, ownerPubKey, ownerAddress } = ownerContextFromWif(wif);
        const state = await getNicknameState(name);
        assertOwnership(state, ownerPubKey, name);
        if (!['ACTIVE', 'EXPIRED_GRACE'].includes(state.status)) {
            return res.status(400).json({ success: false, error: `Nickname is not mutable (status: ${state.status})` });
        }

        const payload = buildNicknameOpPayload(OP.UPDATE, name, { payoutAddress: newPayoutAddress });
        const result = await buildNicknameTransaction({ keyPair, ownerAddress, payload });
        res.json({ success: true, ...result, nickname: name, payout_address: newPayoutAddress });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, ...(error.details ? { details: error.details } : {}) });
    }
});

// POST /api/nicknames/renew  { wif, nickname }
router.post('/renew', async (req, res) => {
    try {
        const { wif, nickname } = req.body;
        if (!wif || !nickname) {
            return res.status(400).json({ success: false, error: 'Missing required fields (wif, nickname)' });
        }
        const name = normalizeName(nickname);
        const { keyPair, ownerPubKey, ownerAddress } = ownerContextFromWif(wif);

        const state = await getNicknameState(name);
        assertOwnership(state, ownerPubKey, name);
        if (!['ACTIVE', 'EXPIRED_GRACE'].includes(state.status)) {
            return res.status(400).json({ success: false, error: `Nickname is not renewable (status: ${state.status})` });
        }
        if (!state.bondTxid || state.bondVout === null) {
            return res.status(400).json({ success: false, error: 'Active bond UTXO not found (Core index unavailable)' });
        }

        const pricing = await getPricing(name);
        const increaseSats = Math.round(pricing.renewalBondIncrease * COIN);
        const newBondSats = state.bondAmountSat + increaseSats;

        const payload = buildNicknameOpPayload(OP.RENEW, name);
        const result = await buildNicknameTransaction({
            keyPair,
            ownerAddress,
            payload,
            bondInput: { txid: state.bondTxid, vout: state.bondVout, amountSat: state.bondAmountSat },
            createdOutputs: [{ script: p2pkScript(ownerPubKey), value: newBondSats }],
        });
        res.json({
            success: true, ...result, nickname: name,
            new_bond_amount: newBondSats / COIN,
            renewal_bond_increase: increaseSats / COIN,
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, ...(error.details ? { details: error.details } : {}) });
    }
});

// POST /api/nicknames/transfer  { wif, nickname, newOwnerPubKey }
router.post('/transfer', async (req, res) => {
    try {
        const { wif, nickname, newOwnerPubKey } = req.body;
        if (!wif || !nickname || !newOwnerPubKey) {
            return res.status(400).json({ success: false, error: 'Missing required fields (wif, nickname, newOwnerPubKey)' });
        }
        const name = normalizeName(nickname);
        const newOwnerBuf = Buffer.from(String(newOwnerPubKey), 'hex');
        if (newOwnerBuf.length !== 33) {
            return res.status(400).json({ success: false, error: 'New owner pubkey must be a 33-byte compressed pubkey (hex)' });
        }

        const { keyPair, ownerPubKey, ownerAddress } = ownerContextFromWif(wif);
        const state = await getNicknameState(name);
        assertOwnership(state, ownerPubKey, name);
        if (!['ACTIVE', 'EXPIRED_GRACE'].includes(state.status)) {
            return res.status(400).json({ success: false, error: `Nickname is not mutable (status: ${state.status})` });
        }
        if (!state.bondTxid || state.bondVout === null) {
            return res.status(400).json({ success: false, error: 'Active bond UTXO not found (Core index unavailable)' });
        }

        const payload = buildNicknameOpPayload(OP.TRANSFER, name, { newOwnerPubKey: newOwnerBuf.toString('hex') });
        const result = await buildNicknameTransaction({
            keyPair,
            ownerAddress,
            payload,
            bondInput: { txid: state.bondTxid, vout: state.bondVout, amountSat: state.bondAmountSat },
            createdOutputs: [{ script: p2pkScript(newOwnerBuf.toString('hex')), value: state.bondAmountSat }],
        });
        res.json({ success: true, ...result, nickname: name, new_owner_pubkey: newOwnerBuf.toString('hex') });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, ...(error.details ? { details: error.details } : {}) });
    }
});

// POST /api/nicknames/release  { wif, nickname }
router.post('/release', async (req, res) => {
    try {
        const { wif, nickname } = req.body;
        if (!wif || !nickname) {
            return res.status(400).json({ success: false, error: 'Missing required fields (wif, nickname)' });
        }
        const name = normalizeName(nickname);
        const { keyPair, ownerPubKey, ownerAddress } = ownerContextFromWif(wif);

        const state = await getNicknameState(name);
        assertOwnership(state, ownerPubKey, name);
        if (!['ACTIVE', 'EXPIRED_GRACE'].includes(state.status)) {
            return res.status(400).json({ success: false, error: `Nickname is not releasable (status: ${state.status})` });
        }

        const payload = buildNicknameOpPayload(OP.RELEASE, name);
        const result = await buildNicknameTransaction({ keyPair, ownerAddress, payload });
        res.json({ success: true, ...result, nickname: name });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, ...(error.details ? { details: error.details } : {}) });
    }
});

// POST /api/nicknames/claim-bond  { wif, nickname }
router.post('/claim-bond', async (req, res) => {
    try {
        const { wif, nickname } = req.body;
        if (!wif || !nickname) {
            return res.status(400).json({ success: false, error: 'Missing required fields (wif, nickname)' });
        }
        const name = normalizeName(nickname);
        const { keyPair, ownerPubKey, ownerAddress } = ownerContextFromWif(wif);

        const state = await getNicknameState(name);
        assertOwnership(state, ownerPubKey, name);
        if (state.status !== 'BOND_CLAIMABLE') {
            return res.status(400).json({ success: false, error: `Bond is not claimable (status: ${state.status})` });
        }
        if (!state.bondTxid || state.bondVout === null) {
            return res.status(400).json({ success: false, error: 'Claimable bond UTXO not found (Core index unavailable)' });
        }

        const payload = buildNicknameOpPayload(OP.CLAIM_BOND, name);
        const result = await buildNicknameTransaction({
            keyPair,
            ownerAddress,
            payload,
            bondInput: { txid: state.bondTxid, vout: state.bondVout, amountSat: state.bondAmountSat },
            claimToChange: true,
        });
        res.json({ success: true, ...result, nickname: name, claimed_amount: result.change || (state.bondAmountSat / COIN) });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message, ...(error.details ? { details: error.details } : {}) });
    }
});

// POST /api/nicknames/send  { wif, nickname, amount, fromAddress, memo?, memoType? }
// Resolve a nickname to its payout address and send a normal payment (optionally with a BMEM1 memo).
router.post('/send', async (req, res) => {
    try {
        const { wif, nickname, amount, fromAddress, memo, memoType } = req.body;
        if (!wif || !nickname || !amount || !fromAddress) {
            return res.status(400).json({ success: false, error: 'Missing required fields (wif, nickname, amount, fromAddress)' });
        }

        const name = normalizeName(nickname);

        // Resolve nickname → payout address
        let payoutAddress = null;
        try {
            const rpcResult = await rpcClient.call('resolvenickname', [name]);
            if (rpcResult && rpcResult.payout_address && rpcResult.resolves !== false) {
                payoutAddress = rpcResult.payout_address;
            }
        } catch (e) { }
        if (!payoutAddress) {
            const pool = getPool();
            const { rows } = await pool.query("SELECT payout_address FROM nicknames WHERE nickname = $1 AND status = 'ACTIVE'", [name]);
            if (rows.length > 0) payoutAddress = rows[0].payout_address;
        }
        if (!payoutAddress) {
            return res.status(404).json({ success: false, error: `Nickname "${name}" not found or not active` });
        }

        const keyPair = ECPair.fromWIF(wif, B1T_NETWORK);
        const amountSat = Math.round(Number(amount) * COIN);
        const feeCtx = await getFeeContext();

        let memoPayload = null;
        if (memo) memoPayload = buildMemoPayload(memo, memoType || 'utf8');

        const utxos = await getSpendableUtxos(fromAddress);
        if (utxos.length === 0) return res.status(400).json({ success: false, error: 'No UTXOs available' });

        const psbt = new bitcoin.Psbt({ network: B1T_NETWORK });
        const selected = [];
        let totalInput = 0;
        let feeSat = 0;
        let ok = false;
        for (const u of utxos) {
            selected.push(u);
            totalInput += u.satoshis;
            const numOut = 1 /* main */ + 1 /* change */ + (memoPayload ? 1 : 0);
            feeSat = feeForSize(selected.length, numOut, memoPayload ? memoPayload.length : 0, feeCtx);
            if (totalInput >= amountSat + feeSat) { ok = true; break; }
        }
        if (!ok) {
            return res.status(400).json({ success: false, error: 'Insufficient balance', required: (amountSat + feeSat) / COIN, available: totalInput / COIN });
        }

        for (const u of selected) {
            const hex = await fetchPrevTxHex(u.txid);
            psbt.addInput({ hash: u.txid, index: u.outputIndex, nonWitnessUtxo: Buffer.from(hex, 'hex') });
        }
        if (memoPayload) psbt.addOutput({ script: opReturnScript(memoPayload), value: 0 });
        psbt.addOutput({ address: payoutAddress, value: amountSat });
        const change = totalInput - amountSat - feeSat;
        if (change >= DUST) psbt.addOutput({ address: fromAddress, value: change });

        selected.forEach((_, i) => psbt.signInput(i, keyPair));
        psbt.finalizeAllInputs();

        const txHex = psbt.extractTransaction().toHex();
        const txid = await rpcClient.sendRawTransaction(txHex);
        res.json({ success: true, txid, nickname: name, resolvedAddress: payoutAddress, amount: Number(amount), fee: feeSat / COIN });
    } catch (error) {
        console.error('Send to nickname error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Export helpers for the indexer and for encoding-parity tests
export { parseNicknameOpFromHex, findBondOutput, p2pkScriptHex, buildNicknameOpPayload, opReturnScript, p2pkScript, OP };

export default router;
