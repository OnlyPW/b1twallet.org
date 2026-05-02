import express from 'express';
import rpcClient from '../services/rpcClient.js';
import { getPool, getTipHeight } from '../services/db.js';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const router = express.Router();
const ECPair = ECPairFactory(ecc);

// B1T Network Parameters
const B1T_NETWORK = {
    messagePrefix: '\x18Bit Signed Message:\n',
    bech32: 'bc',
    bip32: { public: 0x02FACAFD, private: 0x02FAC398 },
    pubKeyHash: 0x19,
    scriptHash: 0x16,
    wif: 0x9E,
};

// ─── Constants from Core ───
const NICKNAME_ACTIVATION_HEIGHT = 400000;
const BIT_NICKNAME_MAGIC = Buffer.from([0x42, 0x49, 0x54, 0x31]); // "BIT1"
const DEST_PKH = 0x01;
const DEST_SH = 0x02;

// ─── Helper: CompactSize write ───
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

// ─── Helper: Encode address to destination bytes ───
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
    throw new Error('Unsupported address type');
}

// ─── Helper: Build nickname OP_RETURN payload ───
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
        case 1: { // REGISTER
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
        case 2: { // UPDATE
            if (!options.payoutAddress) throw new Error('UPDATE requires payoutAddress');
            const destBytes = encodeDestinationBytes(options.payoutAddress);
            parts.push(writeCompactSize(21));
            parts.push(destBytes);
            break;
        }
        case 3: { // TRANSFER
            if (!options.newOwnerPubKey) throw new Error('TRANSFER requires newOwnerPubKey');
            const pubKeyBuf = Buffer.from(options.newOwnerPubKey, 'hex');
            if (pubKeyBuf.length !== 33) throw new Error('New owner pubkey must be 33 bytes');
            parts.push(writeCompactSize(33));
            parts.push(pubKeyBuf);
            break;
        }
        case 4: // RENEW
        case 5: // RELEASE
        case 6: // CLAIM_BOND
            break;
        default:
            throw new Error('Unknown op type');
    }

    return Buffer.concat(parts);
}

// ─── Helper: Build BMEM1 memo payload ───
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

// ─── Helper: Parse nickname OP_RETURN from hex ───
function parseNicknameOpFromHex(scriptHex) {
    try {
        const scriptBuf = Buffer.from(scriptHex, 'hex');
        // Check OP_RETURN (0x6a)
        if (scriptBuf[0] !== 0x6a) return null;

        let offset = 1;
        // Read push data opcode
        if (scriptBuf[offset] < 0x4c) {
            offset += 1;
        } else if (scriptBuf[offset] === 0x4c) {
            offset += 2;
        } else {
            return null;
        }

        const payload = scriptBuf.slice(offset);

        // Check BIT1 magic
        if (payload.length < 6) return null;
        if (!payload.slice(0, 4).equals(BIT_NICKNAME_MAGIC)) return null;

        const opType = payload[4];
        let pos = 5;

        // Read nickname (compactSize + bytes)
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
            case 1: { // REGISTER
                // ownerPubKey
                let pkLen = payload[pos];
                let pkLenBytes = 1;
                if (pkLen === 253) { pkLen = payload.readUInt16LE(pos + 1); pkLenBytes = 3; }
                pos += pkLenBytes;
                result.ownerPubKey = payload.slice(pos, pos + pkLen).toString('hex');
                pos += pkLen;
                // destination
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
            case 2: { // UPDATE
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
            case 3: { // TRANSFER
                let pkLen = payload[pos];
                let pkLenBytes = 1;
                if (pkLen === 253) { pkLen = payload.readUInt16LE(pos + 1); pkLenBytes = 3; }
                pos += pkLenBytes;
                result.newOwnerPubKey = payload.slice(pos, pos + pkLen).toString('hex');
                break;
            }
            case 4:
            case 5:
            case 6:
                break;
            default:
                return null;
        }

        return result;
    } catch (e) {
        return null;
    }
}

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

// GET /api/nicknames/check/:name
router.get('/check/:name', async (req, res) => {
    try {
        const input = req.params.name;
        if (!input) return res.status(400).json({ success: false, error: 'Name required' });

        // Normalize
        let normalized = input.trim().toLowerCase();
        if (normalized.startsWith('@')) normalized = normalized.slice(1);

        // Validate
        const MIN_LEN = 4, MAX_LEN = 16;
        if (normalized.length < MIN_LEN || normalized.length > MAX_LEN) {
            return res.json({ success: true, input, normalized, valid: false, reason: `Length must be ${MIN_LEN}-${MAX_LEN}` });
        }
        if (normalized.startsWith('_') || normalized.endsWith('_')) {
            return res.json({ success: true, input, normalized, valid: false, reason: 'Cannot start/end with underscore' });
        }
        if (normalized.includes('__')) {
            return res.json({ success: true, input, normalized, valid: false, reason: 'No consecutive underscores' });
        }
        if (!/[a-z]/.test(normalized)) {
            return res.json({ success: true, input, normalized, valid: false, reason: 'Must contain at least one letter' });
        }
        if (/[^a-z0-9_]/.test(normalized)) {
            return res.json({ success: true, input, normalized, valid: false, reason: 'Only lowercase letters, digits, underscores' });
        }

        // Try RPC checknickname
        let rpcResult = null;
        try {
            rpcResult = await rpcClient.call('checknickname', [normalized]);
        } catch (e) {
            // RPC might not have nickname support yet
        }

        if (rpcResult) {
            return res.json({
                success: true,
                input,
                normalized: rpcResult.normalized || normalized,
                valid: rpcResult.valid !== false,
                reason: rpcResult.reason || '',
                registration_fee: rpcResult.registration_fee,
                bond_amount: rpcResult.bond_amount,
                renewal_fee: rpcResult.renewal_fee,
                pricing_multiplier_permille: rpcResult.pricing_multiplier_permille,
            });
        }

        // Fallback: local pricing
        const pricing = getLocalPricing(normalized.length);
        res.json({
            success: true,
            input,
            normalized,
            valid: true,
            registration_fee: pricing.registrationFee,
            bond_amount: pricing.bondAmount,
            renewal_fee: pricing.renewalFee,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/nicknames/info/:name
router.get('/info/:name', async (req, res) => {
    try {
        let name = (req.params.name || '').trim().toLowerCase();
        if (name.startsWith('@')) name = name.slice(1);

        // Try RPC first
        try {
            const rpcResult = await rpcClient.call('getnicknameinfo', [name]);
            if (rpcResult && rpcResult.nickname) {
                return res.json({ success: true, ...rpcResult });
            }
        } catch (e) { }

        // Fallback: query local DB
        const pool = getPool();
        const { rows } = await pool.query(
            'SELECT * FROM nicknames WHERE nickname = $1', [name]
        );
        if (rows.length > 0) {
            const row = rows[0];
            return res.json({
                success: true,
                nickname: row.nickname,
                status: row.status,
                payout_address: row.payout_address,
                owner_pubkey: row.owner_pubkey,
                registration_height: row.registration_height,
                active_until: row.active_until_height,
                grace_until: row.grace_until_height,
                bond_amount: row.bond_amount_satoshi ? row.bond_amount_satoshi / 1e8 : 0,
                bond_txid: row.bond_txid,
                bond_vout: row.bond_vout,
                released: row.released,
                bond_claimed: row.bond_claimed,
            });
        }

        res.json({ success: true, nickname: name, status: 'NOT_REGISTERED' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/nicknames/resolve/:name
router.get('/resolve/:name', async (req, res) => {
    try {
        let name = (req.params.name || '').trim().toLowerCase();
        if (name.startsWith('@')) name = name.slice(1);

        // Try RPC resolvenickname
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

        // Fallback: query local DB
        const pool = getPool();
        const { rows } = await pool.query(
            "SELECT payout_address, status FROM nicknames WHERE nickname = $1 AND status = 'ACTIVE'", [name]
        );
        if (rows.length > 0) {
            return res.json({
                success: true,
                nickname: name,
                payout_address: rows[0].payout_address,
                resolves: true,
                status: 'ACTIVE',
            });
        }

        res.json({ success: true, nickname: name, resolves: false, status: 'NOT_FOUND' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/nicknames/list
router.get('/list', async (req, res) => {
    try {
        const start = (req.query.start || '').trim().toLowerCase();
        const count = Math.min(parseInt(req.query.count) || 50, 500);

        // Try RPC first
        try {
            const rpcResult = await rpcClient.call('listnicknames', [start, count]);
            if (Array.isArray(rpcResult)) {
                return res.json({ success: true, nicknames: rpcResult, source: 'rpc' });
            }
        } catch (e) { }

        // Fallback: query local DB
        const pool = getPool();
        const { rows } = await pool.query(
            'SELECT * FROM nicknames WHERE nickname >= $1 ORDER BY nickname LIMIT $2',
            [start, count]
        );

        const nicknames = rows.map(row => ({
            nickname: row.nickname,
            status: row.status,
            payout_address: row.payout_address,
            owner_pubkey: row.owner_pubkey,
            registration_height: row.registration_height,
            active_until: row.active_until_height,
            grace_until: row.grace_until_height,
            bond_amount: row.bond_amount_satoshi ? row.bond_amount_satoshi / 1e8 : 0,
        }));

        res.json({ success: true, nicknames, source: 'db' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/nicknames/register
router.post('/register', async (req, res) => {
    try {
        const { wif, nickname, payoutAddress, fromAddress } = req.body;
        if (!wif || !nickname || !payoutAddress || !fromAddress) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Normalize and validate
        let normalized = nickname.trim().toLowerCase();
        if (normalized.startsWith('@')) normalized = normalized.slice(1);

        // Check activation height
        const tipHeight = await getTipHeight();
        if (tipHeight < NICKNAME_ACTIVATION_HEIGHT) {
            return res.status(400).json({
                success: false,
                error: `Nickname feature activates at block ${NICKNAME_ACTIVATION_HEIGHT}. Current: ${tipHeight}`,
            });
        }

        // Check if already registered
        try {
            const info = await rpcClient.call('getnicknameinfo', [normalized]);
            if (info && info.status && ['ACTIVE', 'EXPIRED_GRACE'].includes(info.status)) {
                return res.status(409).json({
                    success: false,
                    error: `Nickname "${normalized}" is already registered (status: ${info.status})`,
                });
            }
        } catch (e) { }

        // Get pricing
        let pricing;
        try {
            pricing = await rpcClient.call('checknickname', [normalized]);
        } catch (e) {
            pricing = getLocalPricing(normalized.length);
        }

        const bondSats = Math.round((pricing.bond_amount || pricing.bondAmount) * 1e8);
        const feeSats = Math.round((pricing.registration_fee || pricing.registrationFee || 0.0001) * 1e8);

        // Derive owner pubkey from WIF
        const keyPair = ECPair.fromWIF(wif, B1T_NETWORK);
        const ownerPubKey = Buffer.from(keyPair.publicKey).toString('hex');

        // Build OP_RETURN payload
        const payload = buildNicknameOpPayload(1, normalized, {
            ownerPubKey,
            payoutAddress,
        });

        // Get UTXOs
        let utxos = [];
        try {
            utxos = await rpcClient.getAddressUtxos(fromAddress);
        } catch (e) {
            return res.status(400).json({ success: false, error: 'No UTXOs available' });
        }
        if (!utxos || utxos.length === 0) {
            return res.status(400).json({ success: false, error: 'No UTXOs available' });
        }

        // Sort UTXOs by value (largest first)
        utxos.sort((a, b) => b.satoshis - a.satoshis);

        // Build PSBT
        const psbt = new bitcoin.Psbt({ network: B1T_NETWORK });

        // Estimate fee (rough: ~250 bytes base + payload)
        const estimatedSize = 250 + payload.length + 35; // inputs + outputs + overhead
        let minFee = 0.0001;
        try {
            const mempoolInfo = await rpcClient.getMempoolInfo();
            const networkInfo = await rpcClient.getNetworkInfo();
            minFee = Math.max(
                (networkInfo?.relayfee || 0.0001),
                (mempoolInfo?.mempoolminfee || 0),
                0.0001
            );
        } catch { }
        const feeSat = Math.max(Math.ceil(estimatedSize * 10), Math.round(minFee * 1e8));

        const totalNeeded = bondSats + feeSat;
        let totalInput = 0;
        const selectedUtxos = [];

        for (const utxo of utxos) {
            selectedUtxos.push(utxo);
            totalInput += utxo.satoshis;
            if (totalInput >= totalNeeded) break;
        }

        if (totalInput < totalNeeded) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient balance',
                required: totalNeeded / 1e8,
                available: totalInput / 1e8,
            });
        }

        // Add inputs
        for (const utxo of selectedUtxos) {
            let txHex;
            try {
                txHex = await rpcClient.call('getrawtransaction', [utxo.txid], 10000);
            } catch (e) {
                return res.status(500).json({ success: false, error: 'Cannot fetch previous transaction' });
            }
            psbt.addInput({
                hash: utxo.txid,
                index: utxo.outputIndex,
                nonWitnessUtxo: Buffer.from(txHex, 'hex'),
            });
        }

        // Output 0: OP_RETURN (0 satoshi)
        psbt.addOutput({ script: Buffer.concat([Buffer.from([0x6a, payload.length]), payload]), value: 0 });

        // Output 1: Bond (P2PK to owner)
        const p2pkScript = Buffer.concat([
            Buffer.from([33]),
            Buffer.from(ownerPubKey, 'hex'),
            Buffer.from([0xac]), // OP_CHECKSIG
        ]);
        psbt.addOutput({ script: p2pkScript, value: bondSats });

        // Change output
        const change = totalInput - bondSats - feeSat;
        if (change > 546) {
            psbt.addOutput({ address: fromAddress, value: change });
        }

        // Sign all inputs
        selectedUtxos.forEach((_, i) => psbt.signInput(i, keyPair));
        psbt.finalizeAllInputs();

        const txHex = psbt.extractTransaction().toHex();
        const txid = await rpcClient.sendRawTransaction(txHex);

        res.json({
            success: true,
            txid,
            nickname: normalized,
            bond_amount: bondSats / 1e8,
            fee: feeSat / 1e8,
        });
    } catch (error) {
        console.error('Nickname register error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/nicknames/send
router.post('/send', async (req, res) => {
    try {
        const { wif, nickname, amount, fromAddress, memo, memoType } = req.body;
        if (!wif || !nickname || !amount || !fromAddress) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        let name = nickname.trim().toLowerCase();
        if (name.startsWith('@')) name = name.slice(1);

        // Resolve nickname
        let payoutAddress;
        try {
            const rpcResult = await rpcClient.call('resolvenickname', [name]);
            if (rpcResult && rpcResult.payout_address && rpcResult.resolves) {
                payoutAddress = rpcResult.payout_address;
            }
        } catch (e) { }

        if (!payoutAddress) {
            // Fallback: DB lookup
            const pool = getPool();
            const { rows } = await pool.query(
                "SELECT payout_address FROM nicknames WHERE nickname = $1 AND status = 'ACTIVE'", [name]
            );
            if (rows.length > 0) {
                payoutAddress = rows[0].payout_address;
            }
        }

        if (!payoutAddress) {
            return res.status(404).json({ success: false, error: `Nickname "${name}" not found or not active` });
        }

        // Build send transaction (similar to existing /send route)
        const keyPair = ECPair.fromWIF(wif, B1T_NETWORK);
        const amountSat = Math.floor(amount * 1e8);
        const psbt = new bitcoin.Psbt({ network: B1T_NETWORK });

        // Get UTXOs
        let utxos = await rpcClient.getAddressUtxos(fromAddress);
        if (!utxos || utxos.length === 0) {
            return res.status(400).json({ success: false, error: 'No UTXOs available' });
        }
        utxos.sort((a, b) => b.satoshis - a.satoshis);

        let minFee = 0.0001;
        try {
            const mempoolInfo = await rpcClient.getMempoolInfo();
            const networkInfo = await rpcClient.getNetworkInfo();
            minFee = Math.max((networkInfo?.relayfee || 0.0001), (mempoolInfo?.mempoolminfee || 0), 0.0001);
        } catch { }

        let estimatedSize = 250;
        if (memo) {
            const memoPayload = buildMemoPayload(memo, memoType || 'utf8');
            estimatedSize += memoPayload.length + 10;
        }
        const feeSat = Math.max(Math.ceil(estimatedSize * 10), Math.round(minFee * 1e8));

        const totalNeeded = amountSat + feeSat;
        let totalInput = 0;
        const selectedUtxos = [];

        for (const utxo of utxos) {
            selectedUtxos.push(utxo);
            totalInput += utxo.satoshis;
            if (totalInput >= totalNeeded) break;
        }

        if (totalInput < totalNeeded) {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }

        // Add inputs
        for (const utxo of selectedUtxos) {
            let txHex;
            try {
                txHex = await rpcClient.call('getrawtransaction', [utxo.txid], 10000);
            } catch (e) {
                return res.status(500).json({ success: false, error: 'Cannot fetch previous transaction' });
            }
            psbt.addInput({
                hash: utxo.txid,
                index: utxo.outputIndex,
                nonWitnessUtxo: Buffer.from(txHex, 'hex'),
            });
        }

        // Add memo OP_RETURN if provided
        if (memo) {
            const memoPayload = buildMemoPayload(memo, memoType || 'utf8');
            psbt.addOutput({
                script: Buffer.concat([Buffer.from([0x6a, memoPayload.length]), memoPayload]),
                value: 0,
            });
        }

        // Main output
        psbt.addOutput({ address: payoutAddress, value: amountSat });

        // Change
        const change = totalInput - amountSat - feeSat;
        if (change > 546) {
            psbt.addOutput({ address: fromAddress, value: change });
        }

        // Sign
        selectedUtxos.forEach((_, i) => psbt.signInput(i, keyPair));
        psbt.finalizeAllInputs();

        const txHex = psbt.extractTransaction().toHex();
        const txid = await rpcClient.sendRawTransaction(txHex);

        res.json({
            success: true,
            txid,
            nickname: name,
            resolvedAddress: payoutAddress,
            amount,
            fee: feeSat / 1e8,
        });
    } catch (error) {
        console.error('Send to nickname error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/nicknames/update
router.post('/update', async (req, res) => {
    try {
        const { wif, nickname, newPayoutAddress, fromAddress } = req.body;
        if (!wif || !nickname || !newPayoutAddress || !fromAddress) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        let name = nickname.trim().toLowerCase();
        if (name.startsWith('@')) name = name.slice(1);

        const payload = buildNicknameOpPayload(2, name, { payoutAddress: newPayoutAddress });
        const result = await buildAndSendSimpleTx(wif, fromAddress, payload);
        res.json({ success: true, ...result, nickname: name });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/nicknames/release
router.post('/release', async (req, res) => {
    try {
        const { wif, nickname, fromAddress } = req.body;
        if (!wif || !nickname || !fromAddress) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        let name = nickname.trim().toLowerCase();
        if (name.startsWith('@')) name = name.slice(1);

        const payload = buildNicknameOpPayload(5, name);
        const result = await buildAndSendSimpleTx(wif, fromAddress, payload);
        res.json({ success: true, ...result, nickname: name });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/nicknames/renew
router.post('/renew', async (req, res) => {
    try {
        const { wif, nickname, fromAddress } = req.body;
        if (!wif || !nickname || !fromAddress) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        let name = nickname.trim().toLowerCase();
        if (name.startsWith('@')) name = name.slice(1);

        // Get current nickname info for bond UTXO
        let bondInfo = null;
        try {
            const info = await rpcClient.call('getnicknameinfo', [name]);
            if (info && info.bond_txid && info.bond_vout !== undefined) {
                bondInfo = { txid: info.bond_txid, vout: info.bond_vout, amount: info.bond_amount };
            }
        } catch (e) { }

        const payload = buildNicknameOpPayload(4, name);

        // If we have bond info, build TX with bond input
        if (bondInfo) {
            const keyPair = ECPair.fromWIF(wif, B1T_NETWORK);
            const psbt = new bitcoin.Psbt({ network: B1T_NETWORK });

            // Add bond input
            let bondTxHex;
            try {
                bondTxHex = await rpcClient.call('getrawtransaction', [bondInfo.txid], 10000);
            } catch (e) {
                return res.status(500).json({ success: false, error: 'Cannot fetch bond transaction' });
            }
            psbt.addInput({
                hash: bondInfo.txid,
                index: bondInfo.vout,
                nonWitnessUtxo: Buffer.from(bondTxHex, 'hex'),
            });

            // Add owner UTXO for fee
            let utxos = await rpcClient.getAddressUtxos(fromAddress);
            if (utxos && utxos.length > 0) {
                utxos.sort((a, b) => b.satoshis - a.satoshis);
                const feeUtxo = utxos[0];
                const feeTxHex = await rpcClient.call('getrawtransaction', [feeUtxo.txid], 10000);
                psbt.addInput({
                    hash: feeUtxo.txid,
                    index: feeUtxo.outputIndex,
                    nonWitnessUtxo: Buffer.from(feeTxHex, 'hex'),
                });

                // OP_RETURN output
                psbt.addOutput({
                    script: Buffer.concat([Buffer.from([0x6a, payload.length]), payload]),
                    value: 0,
                });

                // New bond output (increased by renewal fee)
                const renewalIncrease = Math.round(getLocalPricing(name.length).renewalFee * 1e8);
                const newBondAmount = Math.round(bondInfo.amount * 1e8) + renewalIncrease;
                const p2pkScript = Buffer.concat([
                    Buffer.from([33]),
                    Buffer.from(keyPair.publicKey),
                    Buffer.from([0xac]),
                ]);
                psbt.addOutput({ script: p2pkScript, value: newBondAmount });

                // Change
                const feeSat = 10000;
                const change = feeUtxo.satoshis - feeSat;
                if (change > 546) {
                    psbt.addOutput({ address: fromAddress, value: change });
                }

                psbt.signInput(0, keyPair);
                psbt.signInput(1, keyPair);
                psbt.finalizeAllInputs();

                const txHex = psbt.extractTransaction().toHex();
                const txid = await rpcClient.sendRawTransaction(txHex);
                return res.json({ success: true, txid, nickname: name });
            }
        }

        // Fallback: simple TX without bond input
        const result = await buildAndSendSimpleTx(wif, fromAddress, payload);
        res.json({ success: true, ...result, nickname: name });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/nicknames/transfer
router.post('/transfer', async (req, res) => {
    try {
        const { wif, nickname, newOwnerPubKey, fromAddress } = req.body;
        if (!wif || !nickname || !newOwnerPubKey || !fromAddress) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        let name = nickname.trim().toLowerCase();
        if (name.startsWith('@')) name = name.slice(1);

        const payload = buildNicknameOpPayload(3, name, { newOwnerPubKey });

        // Get bond info
        let bondInfo = null;
        try {
            const info = await rpcClient.call('getnicknameinfo', [name]);
            if (info && info.bond_txid && info.bond_vout !== undefined) {
                bondInfo = { txid: info.bond_txid, vout: info.bond_vout, amount: info.bond_amount };
            }
        } catch (e) { }

        if (bondInfo) {
            const keyPair = ECPair.fromWIF(wif, B1T_NETWORK);
            const psbt = new bitcoin.Psbt({ network: B1T_NETWORK });

            // Bond input
            const bondTxHex = await rpcClient.call('getrawtransaction', [bondInfo.txid], 10000);
            psbt.addInput({
                hash: bondInfo.txid,
                index: bondInfo.vout,
                nonWitnessUtxo: Buffer.from(bondTxHex, 'hex'),
            });

            // Owner UTXO for fee
            let utxos = await rpcClient.getAddressUtxos(fromAddress);
            if (utxos && utxos.length > 0) {
                utxos.sort((a, b) => b.satoshis - a.satoshis);
                const feeUtxo = utxos[0];
                const feeTxHex = await rpcClient.call('getrawtransaction', [feeUtxo.txid], 10000);
                psbt.addInput({
                    hash: feeUtxo.txid,
                    index: feeUtxo.outputIndex,
                    nonWitnessUtxo: Buffer.from(feeTxHex, 'hex'),
                });
            }

            // OP_RETURN
            psbt.addOutput({
                script: Buffer.concat([Buffer.from([0x6a, payload.length]), payload]),
                value: 0,
            });

            // New bond to new owner
            const newPubKeyBuf = Buffer.from(newOwnerPubKey, 'hex');
            const p2pkScript = Buffer.concat([Buffer.from([33]), newPubKeyBuf, Buffer.from([0xac])]);
            psbt.addOutput({ script: p2pkScript, value: Math.round(bondInfo.amount * 1e8) });

            // Change
            const feeSat = 10000;
            if (utxos && utxos.length > 0) {
                const change = utxos[0].satoshis - feeSat;
                if (change > 546) {
                    psbt.addOutput({ address: fromAddress, value: change });
                }
            }

            psbt.signInput(0, keyPair);
            if (psbt.inputCount > 1) psbt.signInput(1, keyPair);
            psbt.finalizeAllInputs();

            const txHex = psbt.extractTransaction().toHex();
            const txid = await rpcClient.sendRawTransaction(txHex);
            return res.json({ success: true, txid, nickname: name });
        }

        const result = await buildAndSendSimpleTx(wif, fromAddress, payload);
        res.json({ success: true, ...result, nickname: name });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/nicknames/claim-bond
router.post('/claim-bond', async (req, res) => {
    try {
        const { wif, nickname, fromAddress } = req.body;
        if (!wif || !nickname || !fromAddress) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        let name = nickname.trim().toLowerCase();
        if (name.startsWith('@')) name = name.slice(1);

        const payload = buildNicknameOpPayload(6, name);

        // Get bond info
        let bondInfo = null;
        try {
            const info = await rpcClient.call('getnicknameinfo', [name]);
            if (info && info.bond_txid && info.bond_vout !== undefined) {
                bondInfo = { txid: info.bond_txid, vout: info.bond_vout, amount: info.bond_amount };
            }
        } catch (e) { }

        if (bondInfo) {
            const keyPair = ECPair.fromWIF(wif, B1T_NETWORK);
            const psbt = new bitcoin.Psbt({ network: B1T_NETWORK });

            const bondTxHex = await rpcClient.call('getrawtransaction', [bondInfo.txid], 10000);
            psbt.addInput({
                hash: bondInfo.txid,
                index: bondInfo.vout,
                nonWitnessUtxo: Buffer.from(bondTxHex, 'hex'),
            });

            // OP_RETURN
            psbt.addOutput({
                script: Buffer.concat([Buffer.from([0x6a, payload.length]), payload]),
                value: 0,
            });

            // Claim bond to owner address
            const feeSat = 10000;
            const claimAmount = Math.round(bondInfo.amount * 1e8) - feeSat;
            if (claimAmount > 546) {
                psbt.addOutput({ address: fromAddress, value: claimAmount });
            }

            psbt.signInput(0, keyPair);
            psbt.finalizeAllInputs();

            const txHex = psbt.extractTransaction().toHex();
            const txid = await rpcClient.sendRawTransaction(txHex);
            return res.json({ success: true, txid, nickname: name });
        }

        const result = await buildAndSendSimpleTx(wif, fromAddress, payload);
        res.json({ success: true, ...result, nickname: name });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Helper: Build and send simple TX with OP_RETURN ───
async function buildAndSendSimpleTx(wif, fromAddress, opReturnPayload) {
    const keyPair = ECPair.fromWIF(wif, B1T_NETWORK);
    const psbt = new bitcoin.Psbt({ network: B1T_NETWORK });

    let utxos = await rpcClient.getAddressUtxos(fromAddress);
    if (!utxos || utxos.length === 0) throw new Error('No UTXOs available');
    utxos.sort((a, b) => b.satoshis - a.satoshis);

    const feeSat = 10000;
    let totalInput = 0;
    const selectedUtxos = [];

    for (const utxo of utxos) {
        selectedUtxos.push(utxo);
        totalInput += utxo.satoshis;
        if (totalInput >= feeSat + 546) break;
    }

    for (const utxo of selectedUtxos) {
        const txHex = await rpcClient.call('getrawtransaction', [utxo.txid], 10000);
        psbt.addInput({
            hash: utxo.txid,
            index: utxo.outputIndex,
            nonWitnessUtxo: Buffer.from(txHex, 'hex'),
        });
    }

    // OP_RETURN output
    psbt.addOutput({
        script: Buffer.concat([Buffer.from([0x6a, opReturnPayload.length]), opReturnPayload]),
        value: 0,
    });

    // Change
    const change = totalInput - feeSat;
    if (change > 546) {
        psbt.addOutput({ address: fromAddress, value: change });
    }

    selectedUtxos.forEach((_, i) => psbt.signInput(i, keyPair));
    psbt.finalizeAllInputs();

    const txHex = psbt.extractTransaction().toHex();
    const txid = await rpcClient.sendRawTransaction(txHex);
    return { txid, fee: feeSat / 1e8 };
}

// ─── Local pricing fallback ───
function getLocalPricing(length) {
    const pricing = {
        4: { registrationFee: 24, bondAmount: 48, renewalFee: 6 },
        5: { registrationFee: 12, bondAmount: 24, renewalFee: 3 },
        6: { registrationFee: 6, bondAmount: 12, renewalFee: 1.5 },
        7: { registrationFee: 3, bondAmount: 6, renewalFee: 0.75 },
    };
    return pricing[length] || { registrationFee: 1, bondAmount: 3, renewalFee: 0.25 };
}

// Export the parser for use by the indexer
export { parseNicknameOpFromHex };

export default router;
