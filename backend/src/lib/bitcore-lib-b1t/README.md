# Bitcore Lib Bitcoin Classic

[![NPM Package](https://img.shields.io/npm/v/bitcore-lib.svg?style=flat-square)](https://www.npmjs.org/package/bitcore-lib)
[![Build Status](https://img.shields.io/travis/bitpay/bitcore-lib.svg?branch=master&style=flat-square)](https://travis-ci.org/bitpay/bitcore-lib)
[![Coverage Status](https://img.shields.io/coveralls/bitpay/bitcore-lib.svg?style=flat-square)](https://coveralls.io/r/bitpay/bitcore-lib)

**A pure and powerful JavaScript Bitcoin Classic library.**

## Principles

Bitcoin Classic is a blockchain protocol that preserves the original vision of Bitcoin with specific improvements to the difficulty adjustment algorithm. The decentralized nature of the Bitcoin Classic network allows for highly resilient infrastructure, and the developer community needs reliable, open-source tools to implement Bitcoin Classic apps and services.

## Get Started

```sh
npm install bitcore-lib-xbt
```

```sh
bower install bitcore-lib-xbt
```

## Features

- Full Bitcoin Classic network support with custom magic number (0xf6bab9d2)
- Specialized difficulty adjustment algorithm:
  - Initial target timespan: 60 seconds (before block 97191)
  - Current target timespan: 10 minutes (after block 97191)
  - Target block spacing: 10 minutes
- Complete transaction creation and signing
- BIP32 HD keys
- Standard Script types and custom Script support
- Message verification and signing
- Native support for all standard Bitcoin Classic address formats

## Documentation

The complete docs are hosted here: [bitcore documentation](docs/). There's also a [bitcore API reference](docs/index.md) available generated from the JSDocs of the project, where you'll find low-level details on each bitcore utility.

## Examples

- [Generate a random address](docs/examples.md#generate-a-random-address)
- [Generate a address from a SHA256 hash](docs/examples.md#generate-a-address-from-a-sha256-hash)
- [Import an address via WIF](docs/examples.md#import-an-address-via-wif)
- [Create a Transaction](docs/examples.md#create-a-transaction)
- [Sign a Bitcoin Classic message](docs/examples.md#sign-a-bitcoin-message)
- [Verify a Bitcoin Classic message](docs/examples.md#verify-a-bitcoin-message)
- [Create an OP RETURN transaction](docs/examples.md#create-an-op-return-transaction)
- [Create a 2-of-3 multisig P2SH address](docs/examples.md#create-a-2-of-3-multisig-p2sh-address)
- [Spend from a 2-of-2 multisig P2SH address](docs/examples.md#spend-from-a-2-of-2-multisig-p2sh-address)

## Building the Browser Bundle

To build a bitcore-lib full bundle for the browser:

```sh
gulp browser
```

This will generate files named `bitcore-lib.js` and `bitcore-lib.min.js`.

## Development & Tests

```sh
git clone https://github.com/senasgr-eth/bitcore-lib-xbt
cd bitcore-lib-xbt
npm install
```

Run all the tests:

```sh
gulp test
```

You can also run just the Node.js tests with `gulp test:node`, just the browser tests with `gulp test:browser` or create a test coverage report (you can open `coverage/lcov-report/index.html` to visualize it) with `gulp coverage`.

## Security

We're using Bitcore in production, as are many others, but please use common sense when doing anything related to finances! We take no responsibility for your implementation decisions.

If you find a security issue, please email security@bitpay.com.

## Contributing

See [CONTRIBUTING.md](https://github.com/bitpay/bitcore/blob/master/Contributing.md) on the main bitcore repo for information about how to contribute.

## License

Code released under [the MIT license](https://github.com/bitpay/bitcore/blob/master/LICENSE).

Copyright 2013-2019 BitPay, Inc. Bitcore is a trademark maintained by BitPay, Inc.
Modified for Bitcoin Classic support.
