const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Test B1T-20 deployment using vorlage pattern
router.post('/deploy-test', async (req, res) => {
  try {
    const { mnemonic, ticker, max = "1000000", lim = "1000" } = req.body;

    if (!mnemonic || !ticker) {
      return res.status(400).json({
        success: false,
        error: 'Mnemonic and ticker are required'
      });
    }

    console.log('🔥 TESTING B1T-20 DEPLOYMENT USING VORLAGE PATTERN');
    console.log(`Ticker: ${ticker}`);
    console.log(`Max Supply: ${max}`);
    console.log(`Limit: ${lim}`);

    // Create B1T-20 deploy JSON (matching vorlage script)
    const b1t20Deploy = {
      p: "b1t-20",
      op: "deploy",
      tick: ticker.toLowerCase(),
      max: max,
      lim: lim
    };

    const parsedB1t20Tx = JSON.stringify(b1t20Deploy);
    const encodedB1t20Tx = Buffer.from(parsedB1t20Tx).toString('hex');

    console.log(`📋 B1T-20 JSON: ${parsedB1t20Tx}`);
    console.log(`📋 Encoded: ${encodedB1t20Tx}`);

    // Create a temporary script in the container
    const tempScript = `
      let bitcore = require('bitcore-lib-b1t');
      const axios = require('axios');

      const RPC_URL = 'http://host.docker.internal:8332';
      const RPC_USER = 'user';
      const RPC_PASS = 'changeme';

      // Simple test transaction
      const privkey = new bitcore.PrivateKey();
      const address = privkey.toAddress();

      console.log('🔐 Test Address:', address.toString());

      // Test RPC connection
      async function testRPC() {
        try {
          const response = await axios.post(RPC_URL, {
            jsonrpc: "1.0",
            id: Date.now(),
            method: "getblockchaininfo",
            params: []
          }, {
            auth: {
              username: RPC_USER,
              password: RPC_PASS
            }
          });

          return { success: true, data: response.data };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }

      // Test B1T-20 deployment
      async function deployB1T20() {
        const rpcResult = await testRPC();
        if (!rpcResult.success) {
          throw new Error('RPC connection failed: ' + rpcResult.error);
        }

        // For now, just return the prepared B1T-20 data
        return {
          success: true,
          ticker: '${ticker}',
          deployJson: '${parsedB1t20Tx}',
          encodedHex: '${encodedB1t20Tx}',
          testAddress: address.toString(),
          blockchainInfo: rpcResult.data
        };
      }

      deployB1T20().then(result => {
        console.log('RESULT:', JSON.stringify(result));
      }).catch(error => {
        console.error('ERROR:', error.message);
        process.exit(1);
      });
    `;

    // Write and execute the script in the container
    const scriptPath = '/tmp/test-b1t20-deploy.js';

    await new Promise((resolve, reject) => {
      const execProcess = exec(`docker exec b1t-wallet-backend sh -c "echo '${tempScript}' > ${scriptPath} && node ${scriptPath}"`,
        (error, stdout, stderr) => {
          if (error) {
            console.error('Script execution error:', error);
            reject(error);
            return;
          }

          console.log('Script stdout:', stdout);
          if (stderr) console.log('Script stderr:', stderr);

          try {
            const resultMatch = stdout.match(/RESULT: (.+)/);
            if (resultMatch) {
              const result = JSON.parse(resultMatch[1]);
              resolve(result);
            } else {
              reject(new Error('No result found in script output'));
            }
          } catch (parseError) {
            reject(new Error('Failed to parse script result: ' + parseError.message));
          }
        }
      );
    });

    res.json({
      success: true,
      message: 'B1T-20 deployment test completed',
      ticker: ticker,
      deployJson: parsedB1t20Tx,
      encodedHex: encodedB1t20Tx
    });

  } catch (error) {
    console.error('❌ B1T-20 deployment test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;