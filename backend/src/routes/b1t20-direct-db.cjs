const express = require('express');
const router = express.Router();

// Status endpoint to test if route is loaded
router.get('/status', async (req, res) => {
  try {
    console.log('✅ B1T-20 Direct DB Route Status Check');

    // Test database connection
    const { getAddressUtxos } = require('../services/dbWallet.js');
    const testAddress = 'B8p3qXwNTXwPAtVceexqhg8M27ZN8mZ5cc';
    const dbUtxos = await getAddressUtxos(testAddress);

    res.json({
      success: true,
      message: 'B1T-20 Direct Database API Active!',
      database: {
        connected: true,
        testAddress: testAddress,
        utxoCount: dbUtxos.length,
        totalB1T: dbUtxos.reduce((sum, utxo) => sum + utxo.satoshis, 0) / 100000000
      }
    });
  } catch (error) {
    console.error('❌ Status check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Direct B1T-20 deployment using database UTXOs (no RPC wallet needed)
router.post('/deploy-direct', async (req, res) => {
  try {
    const { recipientAddress, ticker, max = "1000000", lim = "1000" } = req.body;

    if (!recipientAddress || !ticker) {
      return res.status(400).json({
        success: false,
        error: 'Recipient address and ticker are required'
      });
    }

    console.log('🔥 DIRECT B1T-20 DEPLOYMENT USING DATABASE UTXOS');
    console.log(`Recipient: ${recipientAddress}`);
    console.log(`Ticker: ${ticker}`);
    console.log(`Max Supply: ${max}`);
    console.log(`Limit: ${lim}`);

    // Get UTXOs from database
    const { getAddressUtxos } = require('../services/dbWallet.js');
    const dbUtxos = await getAddressUtxos(recipientAddress);

    console.log(`📊 Found ${dbUtxos.length} UTXOs in database`);
    dbUtxos.forEach((utxo, i) => {
      console.log(`  UTXO ${i + 1}: ${utxo.txid}:${utxo.outputIndex} = ${utxo.satoshis} satoshis (${utxo.satoshis / 100000000} B1T)`);
    });

    if (dbUtxos.length === 0) {
      throw new Error('No UTXOs available in database');
    }

    // Create B1T-20 deployment data
    const b1t20Deploy = {
      p: "b1t-20",
      op: "deploy",
      tick: ticker.toLowerCase(),
      max: max,
      lim: lim
    };

    const parsedB1t20Tx = JSON.stringify(b1t20Deploy);
    const encodedB1t20Tx = Buffer.from(parsedB1t20Tx).toString('hex');

    console.log(`📋 B1T-20 Deploy JSON: ${parsedB1t20Tx}`);
    console.log(`📋 Encoded: ${encodedB1t20Tx}`);

    // Use bitcore-lib-b1t to create transaction
    const bitcore = require('bitcore-lib-b1t');
    const knownPrivateKeyWIF = 'QSz9vcJM9PztU8S1GFUxYSyK7MTHBUHxvgtwn1HTU51C9d5Z9rMn';
    const privateKey = new bitcore.PrivateKey(knownPrivateKeyWIF);
    const address = privateKey.toAddress();

    console.log(`🔐 Using address: ${address.toString()}`);
    console.log(`✅ Address matches: ${address.toString() === recipientAddress}`);

    // Create simple transaction (test without UTXOs first)
    console.log('🔧 Creating transaction...');
    const transaction = new bitcore.Transaction()
      .addData(Buffer.from(encodedB1t20Tx, 'hex'))
      .to(address, 1000000) // 0.01 B1T minimum output
      .change(address);

    console.log('✅ Transaction structure created');
    console.log(`📄 Transaction ID: ${transaction.hash}`);

    // For now, return the prepared transaction data
    return res.json({
      success: true,
      message: 'B1T-20 deployment transaction prepared successfully',
      deployData: {
        ticker: ticker,
        maxSupply: max,
        limit: lim,
        deployJson: parsedB1t20Tx,
        encodedHex: encodedB1t20Tx
      },
      utxos: {
        count: dbUtxos.length,
        totalSatoshis: dbUtxos.reduce((sum, utxo) => sum + utxo.satoshis, 0),
        totalB1T: dbUtxos.reduce((sum, utxo) => sum + utxo.satoshis, 0) / 100000000,
        details: dbUtxos.map(utxo => ({
          txid: utxo.txid,
          vout: utxo.outputIndex,
          satoshis: utxo.satoshis,
          b1t: utxo.satoshis / 100000000
        }))
      },
      transaction: {
        id: transaction.hash,
        serialized: transaction.toString(),
        size: transaction.toBuffer().length
      }
    });

  } catch (error) {
    console.error('❌ Direct B1T-20 deployment failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;