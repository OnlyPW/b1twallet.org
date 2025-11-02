const bip39 = require('bip39');
const bip32 = require('bip32').BIP32Factory(require('tiny-secp256k1'));
const bitcoin = require('bitcoinjs-lib');

// B1T Network Configuration from wallet.js
const B1T_NETWORK = {
  messagePrefix: '\x18Bit Signed Message:\n',
  bech32: 'bc',
  bip32: {
    public: 0x02FACAFD,
    private: 0x02FAC398,
  },
  pubKeyHash: 0x19,
  scriptHash: 0x16,
  wif: 0x9E,
};

// Test with bitcoinjs-lib
const seed = bip39.mnemonicToSeedSync('turn frost survey must fancy view account grit hazard flavor exist tattoo');
const root = bip32.fromSeed(seed, B1T_NETWORK);

const path = "m/44'/3141'/0'/0/0";
const child = root.derivePath(path);

const { address } = bitcoin.payments.p2pkh({
  pubkey: child.publicKey,
  network: B1T_NETWORK,
});

console.log('Generated address with bitcoinjs-lib:', address);
console.log('Expected address: B8p3qXwNTXwPAtVceexqhg8M27ZN8mZ5cc');
console.log('Match:', address === 'B8p3qXwNTXwPAtVceexqhg8M27ZN8mZ5cc');