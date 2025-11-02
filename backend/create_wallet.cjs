const bip39 = require('bip39');
const bip32 = require('bip32');
const bitcoin = require('bitcoinjs-lib');
const B1T_COIN_TYPE = 3141;

const B1T_NETWORK = {
  messagePrefix: '\x18B1T Signed Message:\n',
  bech32: 'b1t',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: 0x19,
  scriptHash: 0x7c,
  wif: 0x80,
};

const seed = bip39.mnemonicToSeedSync('turn frost survey must fancy view account grit hazard flavor exist tattoo');
const root = bip32.fromSeed(seed, B1T_NETWORK);

// Account 0, Index 0
const path = "m/44'/3141'/0'/0/0";
const child = root.derivePath(path);

console.log('Path:', path);
console.log('Private Key (WIF):', child.toWIF());
console.log('Address:', 'B8p3qXwNTXwPAtVceexqhg8M27ZN8mZ5cc');

// Create wallet file
const wallet = {
  privkey: child.toWIF(),
  address: 'B8p3qXwNTXwPAtVceexqhg8M27ZN8mZ5cc',
  utxos: []
};

require('fs').writeFileSync('./B1T-20-Library/.wallet.json', JSON.stringify(wallet, null, 2));
console.log('Wallet file created successfully');