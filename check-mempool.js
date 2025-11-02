const axios = require('axios');

async function checkMempool() {
  try {
    const response = await axios.post('http://host.docker.internal:8332', {
      jsonrpc: '1.0',
      id: Date.now(),
      method: 'getrawmempool',
      params: []
    }, {
      auth: {
        username: 'user',
        password: 'changeme'
      }
    });

    if (response.data && response.data.result) {
      const mempool = response.data.result;
      console.log('📊 Current Mempool:');
      console.log(`  Total transactions: ${mempool.length}`);

      const deployTx = '0842edc5bfd513acedb05dc353c4dd1d8c5b6293014a548767b21e0ed233b390';
      if (mempool.includes(deployTx)) {
        console.log('✅ B1T-20 RABBIT deployment found in mempool!');
        console.log(`   TXID: ${deployTx}`);
      } else {
        console.log('❌ RABBIT deployment not found in mempool (yet)');
        console.log(`   Searching for: ${deployTx}`);
      }

      // Show first few transactions
      mempool.slice(0, 5).forEach((tx, i) => {
        console.log(`  ${i + 1}. ${tx}`);
      });
    } else {
      console.log('❌ No mempool data available');
    }
  } catch (error) {
    console.error('❌ Failed to check mempool:', error.message);
  }
}

checkMempool();