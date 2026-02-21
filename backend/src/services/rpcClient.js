import axios from 'axios';
import explorerClient from './explorerClient.js';

class BitcoinRPCClient {
  constructor() {
    this.host = process.env.RPC_HOST || 'localhost';
    this.port = process.env.RPC_PORT || 8332;
    this.user = process.env.RPC_USER || 'user';
    this.password = process.env.RPC_PASSWORD || 'changeme';
    this.url = `http://${this.host}:${this.port}`;
    this.id = 0;
  }

  async call(method, params = [], timeoutMs = 30000) {
    try {
      const response = await axios.post(
        this.url,
        {
          jsonrpc: '2.0',
          id: ++this.id,
          method,
          params
        },
        {
          auth: {
            username: this.user,
            password: this.password
          },
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: timeoutMs
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error.message || 'RPC Error');
      }

      return response.data.result;
    } catch (error) {
      if (error.response) {
        console.error('RPC Error Response:', error.response.data);
        throw new Error(`RPC Error: ${error.response.data.error?.message || error.message}`);
      } else if (error.request) {
        console.error('RPC No Response:', error.message);
        throw new Error('B1T Core Node nicht erreichbar');
      } else {
        console.error('RPC Request Error:', error.message);
        throw error;
      }
    }
  }

  // Blockchain Methods
  async getBlockchainInfo() {
    return this.call('getblockchaininfo');
  }

  async getBlockCount() {
    return this.call('getblockcount');
  }

  async getBestBlockHash() {
    return this.call('getbestblockhash');
  }

  async getLatestBlocks(count = 10) {
    try {
      const bestHeight = await this.getBlockCount();
      const blocks = [];
      for (let i = 0; i < count; i++) {
        const height = bestHeight - i;
        if (height < 0) break;
        const hash = await this.call('getblockhash', [height]);
        const block = await this.call('getblock', [hash, 1]); // Verbosity 1 for header/txids/stats
        blocks.push(block);
      }
      return blocks;
    } catch (error) {
      console.error('Error in getLatestBlocks:', error.message);
      return [];
    }
  }

  async getLatestTransactions(count = 10) {
    try {
      const transactions = [];

      // 1. Check Mempool first for the very latest
      try {
        const mempoolTxids = await this.getRawMempool();
        for (const txid of (mempoolTxids || []).slice(0, count)) {
          try {
            const tx = await this.call('getrawtransaction', [txid, true]);
            tx.mempool = true; // Mark as mempool
            transactions.push(tx);
          } catch { }
          if (transactions.length >= count) break;
        }
      } catch (e) {
        console.warn('Mempool fetch failed:', e.message);
      }

      // 2. Look back through blocks if we need more
      const bestHeight = await this.getBlockCount();
      let currentHeight = bestHeight;

      while (transactions.length < count && currentHeight >= 0) {
        const hash = await this.call('getblockhash', [currentHeight]);
        const block = await this.call('getblock', [hash, 1]);
        const txids = block.tx || [];

        // Skip coinbase (index 0)
        for (let i = 1; i < txids.length && transactions.length < count; i++) {
          try {
            const tx = await this.call('getrawtransaction', [txids[i], true]);
            tx.blocktime = block.time;
            transactions.push(tx);
          } catch { }
        }
        currentHeight--;
        // Search up to 100 blocks back for non-coinbase transactions
        if (bestHeight - currentHeight > 100) break;
      }

      // 3. Fallback: If still empty, include at least the latest coinbase transactions
      if (transactions.length === 0) {
        const bestHash = await this.getBestBlockHash();
        const block = await this.call('getblock', [bestHash, 1]);
        const txid = block.tx?.[0];
        if (txid) {
          const tx = await this.call('getrawtransaction', [txid, true]);
          tx.blocktime = block.time;
          transactions.push(tx);
        }
      }

      return transactions;
    } catch (error) {
      console.error('Error in getLatestTransactions:', error.message);
      return [];
    }
  }

  // Network Methods
  async getNetworkInfo() {
    return this.call('getnetworkinfo');
  }

  async getPeerInfo() {
    return this.call('getpeerinfo');
  }

  // Address Methods
  async validateAddress(address) {
    return this.call('validateaddress', [address]);
  }

  async getAddressBalance(address) {
    try {
      // Primär: Nutze B1T Explorer API (schnell & zuverlässig)
      console.log('Nutze B1T Explorer API für Balance');
      const explorerData = await explorerClient.getAddress(address);
      return {
        balance: explorerData.balance || 0,
        received: explorerData.received || 0,
        sent: explorerData.sent || 0
      };
    } catch (error) {
      console.warn('Explorer API Fehler, nutze RPC Fallback:', error.message);

      // Fallback 1: Wallet-RPC
      try {
        await this.call('importaddress', [address, '', false]);
        const utxos = await this.call('listunspent', [0, 9999999, [address]]);

        let balance = 0;
        for (const utxo of utxos) {
          balance += utxo.amount;
        }

        const received = await this.call('getreceivedbyaddress', [address, 0]);
        return { balance, received };
      } catch (rpcError) {
        console.warn('Wallet-RPC Fehler, nutze scantxoutset:', rpcError.message);

        // Fallback 2: scantxoutset (langsam)
        try {
          const scanResult = await this.call('scantxoutset', ['start', [`addr(${address})`]]);
          if (scanResult && scanResult.total_amount !== undefined) {
            return {
              balance: scanResult.total_amount,
              received: scanResult.total_amount
            };
          }
        } catch (scanError) {
          console.error('scantxoutset Error:', scanError.message);
        }
      }

      return { balance: 0, received: 0 };
    }
  }

  async getAddressUtxos(address) {
    // Priorität: schnell und wallet-unabhängig → scantxoutset
    try {
      console.log('Nutze scantxoutset für schnelle UTXO-Ermittlung...');
      const scanResult = await this.call('scantxoutset', ['start', [`addr(${address})`]], 15000);
      if (scanResult && Array.isArray(scanResult.unspents)) {
        console.log(`scantxoutset fand ${scanResult.unspents.length} UTXOs`);
        return scanResult.unspents.map(utxo => ({
          txid: utxo.txid,
          outputIndex: utxo.vout,
          satoshis: Math.floor(utxo.amount * 100000000),
          height: utxo.height || -1,
          script: utxo.scriptPubKey
        }));
      }
    } catch (scanError) {
      console.warn('scantxoutset nicht verfügbar oder fehlgeschlagen:', scanError.message);
    }

    // Fallback: Wallet-RPC ohne Rescan (schneller, zeigt nur neue UTXOs)
    try {
      console.log('Importiere Adresse ohne Rescan und nutze listunspent...');
      try {
        await this.call('importaddress', [address, '', false], 5000);
      } catch (importError) {
        if (!String(importError.message || '').includes('already exists')) {
          console.warn('Import-Warnung:', importError.message);
        }
      }
      const utxos = await this.call('listunspent', [0, 9999999, [address]], 10000);
      console.log(`Gefunden: ${utxos.length} UTXOs (listunspent) für ${address}`);
      const mapped = utxos.map(utxo => ({
        txid: utxo.txid,
        outputIndex: utxo.vout,
        satoshis: Math.floor(utxo.amount * 100000000),
        height: utxo.confirmations > 0 ? -1 : 0,
        script: utxo.scriptPubKey
      }));
      if (mapped.length > 0) return mapped;

      // Explorer-Fallback: Rekonstruiere UTXOs aus Adress-Transaktionen
      console.log('Kein listunspent-Ergebnis – nutze Explorer-Fallback für UTXOs...');
      const eUtxos = await explorerClient.getAddressUtxos(address);
      if (Array.isArray(eUtxos) && eUtxos.length > 0) {
        console.log(`Explorer-Fallback lieferte ${eUtxos.length} UTXOs`);
        return eUtxos.map(u => ({
          txid: u.txid,
          outputIndex: u.outputIndex ?? u.vout,
          satoshis: typeof u.satoshis === 'number' ? u.satoshis : Math.floor((u.value || 0) * 100000000),
          height: u.height ?? -1,
          script: u.script || u.scriptPubKey || null,
        }));
      }

      return [];
    } catch (walletError) {
      console.error('Wallet-RPC UTXO-Abruf fehlgeschlagen:', walletError.message);
      // Als letzter Versuch: Explorer-Fallback
      try {
        const eUtxos = await explorerClient.getAddressUtxos(address);
        if (Array.isArray(eUtxos) && eUtxos.length > 0) {
          console.log(`Explorer-Fallback lieferte ${eUtxos.length} UTXOs (nach Wallet-Fehler)`);
          return eUtxos.map(u => ({
            txid: u.txid,
            outputIndex: u.outputIndex ?? u.vout,
            satoshis: typeof u.satoshis === 'number' ? u.satoshis : Math.floor((u.value || 0) * 100000000),
            height: u.height ?? -1,
            script: u.script || u.scriptPubKey || null,
          }));
        }
      } catch (e) {
        console.warn('Explorer-Fallback für UTXOs fehlgeschlagen:', e.message);
      }
      return [];
    }
  }

  async getAddressTransactions(address, start = 0, end = 10) {
    try {
      // Primär: Nutze B1T Explorer API
      console.log('Nutze B1T Explorer API für Transaktionen');
      const txids = await explorerClient.getAddressTransactions(address, start, end);
      return txids;
    } catch (error) {
      console.warn('Explorer API Fehler, nutze RPC Fallback:', error.message);

      // Fallback: UTXOs durchsuchen
      try {
        await this.call('importaddress', [address, '', false]);
        const utxos = await this.getAddressUtxos(address);
        const txids = [...new Set(utxos.map(u => u.txid))];
        return txids.slice(start, start + end);
      } catch (rpcError) {
        console.warn('Fehler bei Transaktionsabruf:', rpcError.message);
        return [];
      }
    }
  }

  // Transaction Methods
  async getRawTransaction(txid, verbose = true) {
    return this.call('getrawtransaction', [txid, verbose]);
  }

  async sendRawTransaction(hex) {
    return this.call('sendrawtransaction', [hex]);
  }

  async decodeRawTransaction(hex) {
    return this.call('decoderawtransaction', [hex]);
  }

  async estimateFee(blocks = 6) {
    try {
      const result = await this.call('estimatefee', [blocks]);
      return result > 0 ? result : 0.0001; // Minimum fee
    } catch (error) {
      return 0.0001; // Default fee
    }
  }

  // Mempool Methods
  async getMempoolInfo() {
    return this.call('getmempoolinfo');
  }

  async getRawMempool() {
    return this.call('getrawmempool');
  }
}

const rpcClient = new BitcoinRPCClient();

export default rpcClient;

