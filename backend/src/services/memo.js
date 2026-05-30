// BMEM1 on-chain memo codec (OP_RETURN). Lets the wallet attach a short human-readable
// message to a payment and read it back when displaying transactions.
//
// Layout:  "BMEM1" (5) | version=0x01 (1) | type (1) | len (1) | data (len) | CRC16-CCITT (2)

const BMEM_MAGIC = Buffer.from([0x42, 0x4D, 0x45, 0x4D, 0x31]); // "BMEM1"
const TYPE_BYTE = { numeric: 0x01, alnum: 0x02, utf8: 0x03 };
const TYPE_NAME = { 1: 'numeric', 2: 'alnum', 3: 'utf8' };
export const MEMO_MAX_BYTES = 48;

function crc16ccitt(buf) {
    let crc = 0xFFFF;
    for (const byte of buf) {
        crc ^= byte << 8;
        for (let i = 0; i < 8; i++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
        }
    }
    return crc & 0xFFFF;
}

// Build the BMEM1 payload (without the OP_RETURN/pushdata wrapper).
export function buildMemoPayload(data, type = 'utf8') {
    const typeByte = TYPE_BYTE[type];
    if (!typeByte) throw new Error('Invalid memo type');

    const dataBuf = Buffer.from(String(data), 'utf8');
    if (dataBuf.length > MEMO_MAX_BYTES) throw new Error(`Memo too long (max ${MEMO_MAX_BYTES} bytes)`);

    const header = Buffer.concat([
        BMEM_MAGIC,
        Buffer.from([0x01, typeByte, dataBuf.length]),
        dataBuf,
    ]);
    const crc = crc16ccitt(header);
    return Buffer.concat([header, Buffer.from([(crc >> 8) & 0xFF, crc & 0xFF])]);
}

const NICK_MAGIC = Buffer.from([0x42, 0x49, 0x54, 0x31]); // "BIT1" — nickname ops, never a memo

// Extract the single pushed payload from an OP_RETURN script hex. Returns a Buffer or null.
function opReturnPayload(scriptHex) {
    if (!scriptHex || typeof scriptHex !== 'string') return null;
    const buf = Buffer.from(scriptHex, 'hex');
    if (buf[0] !== 0x6a) return null; // OP_RETURN
    let off = 1;
    if (buf[off] < 0x4c) off += 1;
    else if (buf[off] === 0x4c) off += 2; // OP_PUSHDATA1 + len
    else return null;
    return buf.slice(off);
}

function isPrintable(s) {
    if (!s) return false;
    for (const ch of s) {
        const c = ch.codePointAt(0);
        if (c === 0xFFFD) return false;                       // invalid UTF-8
        if (c < 0x20 && c !== 0x0a && c !== 0x09) return false; // control chars (allow \n, \t)
    }
    return true;
}

// Decode a memo from a scriptPubKey hex (OP_RETURN). Tries the structured BMEM1 format first,
// then falls back to a plain-text OP_RETURN. Returns { type, text } or null.
export function parseMemoFromHex(scriptHex) {
    try {
        const p = opReturnPayload(scriptHex);
        if (!p || p.length < 1) return null;

        // Structured BMEM1 memo
        if (p.length >= 8 && p.slice(0, 5).equals(BMEM_MAGIC)) {
            const type = p[6];
            const len = p[7];
            const data = p.slice(8, 8 + len);
            if (data.length !== len) return null;
            if (p.length >= 8 + len + 2) {
                const expected = crc16ccitt(p.slice(0, 8 + len));
                const got = (p[8 + len] << 8) | p[8 + len + 1];
                if (expected !== got) return null;
            }
            return { type: TYPE_NAME[type] || 'utf8', text: data.toString('utf8') };
        }

        // Skip structured nickname operations — those are not memos
        if (p.length >= 4 && p.slice(0, 4).equals(NICK_MAGIC)) return null;

        // Fallback: plain printable-text OP_RETURN memo
        if (p.length <= 80) {
            const text = p.toString('utf8');
            if (isPrintable(text) && text.trim().length > 0) {
                return { type: 'text', text };
            }
        }
        return null;
    } catch {
        return null;
    }
}

// Scan a decoded (verbose) transaction's outputs for a BMEM1 memo. Returns { type, text } or null.
export function extractMemoFromTx(tx) {
    for (const vout of tx?.vout || []) {
        const hex = vout?.scriptPubKey?.hex;
        if (!hex || !hex.startsWith('6a')) continue;
        const memo = parseMemoFromHex(hex);
        if (memo) return memo;
    }
    return null;
}

export default { buildMemoPayload, parseMemoFromHex, extractMemoFromTx, MEMO_MAX_BYTES };
