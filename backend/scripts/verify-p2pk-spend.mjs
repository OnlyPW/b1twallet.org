// Verifies bitcoinjs-lib can sign + finalize a P2PK bond input (renew/transfer/claim depend on it).
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { p2pkScript } from '../src/routes/nicknames.js';

const ECPair = ECPairFactory(ecc);
const NET = { messagePrefix:'\x18Bit Signed Message:\n', bech32:'bc',
  bip32:{public:0x02FACAFD,private:0x02FAC398}, pubKeyHash:0x19, scriptHash:0x16, wif:0x9E };

const kp = ECPair.makeRandom({ network: NET });
const pubHex = Buffer.from(kp.publicKey).toString('hex');
const { address } = bitcoin.payments.p2pkh({ pubkey: kp.publicKey, network: NET });

// Build a fake previous tx whose vout[0] is the P2PK bond
const prev = new bitcoin.Transaction();
prev.version = 1;
prev.addInput(Buffer.alloc(32, 1), 0);
prev.addOutput(p2pkScript(pubHex), 48 * 1e8);
const prevHex = prev.toHex();

// Spend it
const psbt = new bitcoin.Psbt({ network: NET });
psbt.addInput({ hash: prev.getId(), index: 0, nonWitnessUtxo: Buffer.from(prevHex, 'hex') });
psbt.addOutput({ address, value: 47 * 1e8 });
psbt.signInput(0, kp);
psbt.finalizeAllInputs();
const tx = psbt.extractTransaction(true);

const ok = tx && tx.ins.length === 1 && tx.ins[0].script.length > 0;
console.log(ok ? '✅ P2PK bond input signed + finalized, txid ' + tx.getId().slice(0,16) + '…'
               : '❌ P2PK spend failed');
process.exit(ok ? 0 : 1);
