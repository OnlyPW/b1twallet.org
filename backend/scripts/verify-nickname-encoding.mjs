// Verifies that the wallet's nickname OP_RETURN / bond encoding matches B1T Core's
// serialization (nicknameop.cpp). Run: node scripts/verify-nickname-encoding.mjs
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import {
  buildNicknameOpPayload, opReturnScript, p2pkScript, parseNicknameOpFromHex, findBondOutput, OP,
} from '../src/routes/nicknames.js';

const ECPair = ECPairFactory(ecc);
const B1T_NETWORK = {
  messagePrefix: '\x18Bit Signed Message:\n', bech32: 'bc',
  bip32: { public: 0x02FACAFD, private: 0x02FAC398 },
  pubKeyHash: 0x19, scriptHash: 0x16, wif: 0x9E,
};
const MAGIC = Buffer.from('BIT1');

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}

// Independent re-implementation of Core's CDataStream layout
function compactSize(n) {
  if (n < 253) return Buffer.from([n]);
  if (n <= 0xffff) { const b = Buffer.alloc(3); b[0] = 253; b.writeUInt16LE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = 254; b.writeUInt32LE(n, 1); return b;
}
function destBytes(addr) {
  const d = bitcoin.address.fromBase58Check(addr);
  const type = d.version === B1T_NETWORK.pubKeyHash ? 1 : 2;
  return Buffer.concat([Buffer.from([type]), d.hash]);
}
function expectedRegister(name, pubHex, payout) {
  return Buffer.concat([
    MAGIC, Buffer.from([1]),
    compactSize(name.length), Buffer.from(name, 'utf8'),
    compactSize(33), Buffer.from(pubHex, 'hex'),
    compactSize(21), destBytes(payout),
  ]);
}

const kp = ECPair.fromWIF((() => {
  const k = ECPair.makeRandom({ network: B1T_NETWORK });
  return k.toWIF();
})(), B1T_NETWORK);
const pubHex = Buffer.from(kp.publicKey).toString('hex');
const { address: addr } = bitcoin.payments.p2pkh({ pubkey: kp.publicKey, network: B1T_NETWORK });

console.log('B1T nickname encoding parity\n');

// 1. REGISTER payload byte-exactness (short + long name)
for (const nm of ['bit_dev', 'sixteen_chars_xx' /* 16 chars */]) {
  console.log(`REGISTER "${nm}" (len ${nm.length})`);
  const built = buildNicknameOpPayload(OP.REGISTER, nm, { ownerPubKey: pubHex, payoutAddress: addr });
  const exp = expectedRegister(nm, pubHex, addr);
  check('payload matches Core layout', built.equals(exp), `\n    built=${built.toString('hex')}\n    exp  =${exp.toString('hex')}`);

  const script = opReturnScript(built);
  if (built.length < 76) {
    check('OP_RETURN single-byte push', script[0] === 0x6a && script[1] === built.length);
  } else {
    check('OP_RETURN uses OP_PUSHDATA1 (>=76 bytes)', script[0] === 0x6a && script[1] === 0x4c && script[2] === built.length,
      `\n    script=${script.toString('hex')}`);
  }

  const parsed = parseNicknameOpFromHex(script.toString('hex'));
  check('round-trips through parser', parsed && parsed.opType === 1 && parsed.nickname === nm.toLowerCase()
    && parsed.ownerPubKey === pubHex && parsed.payoutAddress === addr,
    `\n    parsed=${JSON.stringify(parsed)}`);
}

// 2. UPDATE / TRANSFER / RENEW / RELEASE / CLAIM round-trips
console.log('UPDATE');
{
  const p = buildNicknameOpPayload(OP.UPDATE, 'bit_dev', { payoutAddress: addr });
  const parsed = parseNicknameOpFromHex(opReturnScript(p).toString('hex'));
  check('payout round-trips', parsed.opType === 2 && parsed.payoutAddress === addr);
}
console.log('TRANSFER');
{
  const p = buildNicknameOpPayload(OP.TRANSFER, 'bit_dev', { newOwnerPubKey: pubHex });
  const parsed = parseNicknameOpFromHex(opReturnScript(p).toString('hex'));
  check('new owner pubkey round-trips', parsed.opType === 3 && parsed.newOwnerPubKey === pubHex);
}
for (const [label, op] of [['RENEW', OP.RENEW], ['RELEASE', OP.RELEASE], ['CLAIM_BOND', OP.CLAIM_BOND]]) {
  console.log(label);
  const p = buildNicknameOpPayload(op, 'bit_dev');
  const exp = Buffer.concat([MAGIC, Buffer.from([op]), compactSize(7), Buffer.from('bit_dev')]);
  check('payload matches Core layout', p.equals(exp));
  const parsed = parseNicknameOpFromHex(opReturnScript(p).toString('hex'));
  check('round-trips', parsed.opType === op && parsed.nickname === 'bit_dev');
}

// 3. P2PK bond script = 0x21 <33-byte pubkey> 0xac (GetScriptForRawPubKey)
console.log('Bond output (P2PK)');
{
  const s = p2pkScript(pubHex);
  check('script = 21 <pubkey> ac', s.length === 35 && s[0] === 0x21 && s[34] === 0xac && s.slice(1, 34).toString('hex') === pubHex);

  // findBondOutput locates the P2PK output in a decoded tx
  const fakeTx = { vout: [
    { n: 0, value: 0, scriptPubKey: { hex: '6a04' } },
    { n: 1, value: 48, scriptPubKey: { hex: s.toString('hex') } },
  ] };
  const bond = findBondOutput(fakeTx, pubHex);
  check('findBondOutput finds vout 1', bond && bond.vout === 1 && bond.satoshis === 48 * 1e8);
}

// 4. Name validation lengths handled by Core (4..16) — sanity on push boundary
console.log('\nPush-boundary note: REGISTER payload length = 62 + nameLen; >=76 (name>=14) needs OP_PUSHDATA1');
{
  const len14 = buildNicknameOpPayload(OP.REGISTER, 'a'.repeat(14), { ownerPubKey: pubHex, payoutAddress: addr }).length;
  check('14-char REGISTER payload is 76 bytes', len14 === 76, `(got ${len14})`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
