/**
 * Client-side key derivation — the mnemonic never leaves the browser.
 * Derives addresses, WIFs, and public keys locally.
 */
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';

const bip32 = BIP32Factory(ecc);

const B1T_NETWORK = {
  messagePrefix: '\x18Bit Signed Message:\n',
  bech32: 'bc',
  bip32: { public: 0x02FACAFD, private: 0x02FAC398 },
  pubKeyHash: 0x19,
  scriptHash: 0x16,
  wif: 0x9E,
};

const COIN_TYPE = 3141;

export function validateMnemonic(mnemonic) {
  return bip39.validateMnemonic(mnemonic.trim());
}

export function generateMnemonic(strength = 128) {
  return bip39.generateMnemonic(strength);
}

function deriveChild(mnemonic, index, change = 0) {
  const seed = bip39.mnemonicToSeedSync(mnemonic.trim());
  const root = bip32.fromSeed(seed, B1T_NETWORK);
  return root.derivePath(`m/44'/${COIN_TYPE}'/0'/${change}/${index}`);
}

export function deriveAddress(mnemonic, index = 0) {
  const child = deriveChild(mnemonic, index);
  const { address } = bitcoin.payments.p2pkh({ pubkey: child.publicKey, network: B1T_NETWORK });
  return { address, index };
}

export function deriveAddresses(mnemonic, count = 5, startIndex = 0) {
  const addresses = [];
  for (let i = startIndex; i < startIndex + count; i++) {
    addresses.push(deriveAddress(mnemonic, i));
  }
  return addresses;
}

export function deriveWIF(mnemonic, index = 0) {
  const child = deriveChild(mnemonic, index);
  return child.toWIF();
}

export function deriveXpub(mnemonic, account = 0) {
  const seed = bip39.mnemonicToSeedSync(mnemonic.trim());
  const root = bip32.fromSeed(seed, B1T_NETWORK);
  const acct = root.derivePath(`m/44'/${COIN_TYPE}'/${account}'`);
  return acct.neutered().toBase58();
}
