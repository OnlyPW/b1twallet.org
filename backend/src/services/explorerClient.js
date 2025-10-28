import axios from 'axios';
const EXPLORER_VERBOSE = String(process.env.EXPLORER_VERBOSE || 'false').toLowerCase() === 'true';

class B1TExplorerClient {
  constructor() {
    this.baseURL = 'https://b1texplorer.com';
  }

  // Get address information
  async getAddress(address) {
    try {
      const response = await axios.get(`${this.baseURL}/ext/getaddress/${address}`, {
        timeout: 10000
      });
      const data = response.data;
      return {
        address: data.address,
        sent: parseFloat(data.sent) || 0,
        received: parseFloat(data.received) || 0,
        balance: parseFloat(data.balance) || 0,
        last_txs: data.last_txs || []
      };
    } catch (error) {
      if (EXPLORER_VERBOSE) console.error('Explorer API Error (getAddress):', error.message);
      throw new Error('Explorer API nicht erreichbar');
    }
  }

  // Get address balance
  async getBalance(address) {
    try {
      const response = await axios.get(`${this.baseURL}/ext/getbalance/${address}`, {
        timeout: 10000
      });
      const balance = parseFloat(response.data) || 0;
      return { balance, received: balance };
    } catch (error) {
      if (EXPLORER_VERBOSE) console.error('Explorer API Error (getBalance):', error.message);
      throw new Error('Balance konnte nicht abgerufen werden');
    }
  }

  // Get address transactions (return txids)
  async getAddressTransactions(address, start = 0, limit = 50) {
    try {
      const addressInfo = await this.getAddress(address);
      let txs = addressInfo.last_txs;
      if (txs && !Array.isArray(txs)) txs = [txs];
      if (!txs) txs = [];
      const txids = txs.map(tx => tx.addresses).filter(Boolean);
      if (EXPLORER_VERBOSE) console.log(`Explorer API: Gefunden ${txids.length} Transaktionen für ${address}`);
      const uniqueTxids = [...new Set(txids)];
      return uniqueTxids.slice(start, start + limit);
    } catch (error) {
      if (EXPLORER_VERBOSE) console.error('Explorer API Error (getAddressTransactions):', error.message);
      return [];
    }
  }

  // Backup (detailed transactions objects from explorer)
  async getAddressTransactionsDetailed(address, start = 0, limit = 50) {
    try {
      const response = await axios.get(
        `${this.baseURL}/ext/getaddresstxs/${address}/${start}/${limit}`,
        { timeout: 15000 }
      );
      return response.data || [];
    } catch (error) {
      if (EXPLORER_VERBOSE) console.error('Explorer API Error (getAddressTransactionsDetailed):', error.message);
      return [];
    }
  }

  // Reconstruct UTXOs for an address using explorer detailed txs
  async getAddressUtxos(address) {
    try {
      const txs = await this.getAddressTransactionsDetailed(address, 0, 200);
      const candidates = [];
      const spent = new Set();

      for (const tx of txs || []) {
        const txid = tx.txid || tx.hash || tx.id || tx.txID;
        const vouts = tx.vout || tx.outputs || [];
        const vins = tx.vin || tx.inputs || [];

        // Track spends
        for (const vin of vins) {
          const ptxid = vin?.txid ?? vin?.txId ?? vin?.txidIn;
          const pvout = vin?.vout ?? vin?.n ?? vin?.outIndex;
          if (ptxid && (pvout !== undefined && pvout !== null)) {
            spent.add(`${ptxid}:${pvout}`);
          }
        }

        // Collect outputs paying to the address
        vouts.forEach((v, idx) => {
          const spk = v.scriptPubKey || v.script || {};
          const addrs = Array.isArray(spk.addresses) ? spk.addresses : (spk.address ? [spk.address] : []);
          const dest = v.address || v.addr || v.destination;
          const matches = (Array.isArray(addrs) && addrs.includes(address)) || (dest && dest === address);
          if (matches) {
            const raw = typeof v.value === 'number' ? v.value : parseFloat(v.value || '0');
            const value = isFinite(raw) ? raw : 0;
            candidates.push({
              txid,
              outputIndex: idx,
              satoshis: Math.floor(value * 100000000),
              height: tx.blockheight ?? tx.height ?? -1,
              script: spk.hex || spk.asm || null,
            });
          }
        });
      }

      // Filter out spent outputs
      return candidates.filter(u => !spent.has(`${u.txid}:${u.outputIndex}`));
    } catch (error) {
      if (EXPLORER_VERBOSE) console.error('Explorer API Error (getAddressUtxos):', error.message);
      return [];
    }
  }

  // Get transaction details
  async getTransaction(txid) {
    try {
      const response = await axios.get(
        `${this.baseURL}/api/getrawtransaction`,
        { params: { txid, decrypt: 1 }, timeout: 10000 }
      );
      return response.data;
    } catch (error) {
      if (EXPLORER_VERBOSE) console.error('Explorer API Error (getTransaction):', error.message);
      throw new Error('Transaktion nicht gefunden');
    }
  }

  // Get current block height
  async getBlockCount() {
    try {
      const response = await axios.get(`${this.baseURL}/ext/getblockcount`, { timeout: 10000 });
      return parseInt(response.data) || 0;
    } catch (error) {
      if (EXPLORER_VERBOSE) console.error('Explorer API Error (getBlockCount):', error.message);
      throw new Error('Block count nicht verfügbar');
    }
  }

  // Check availability
  async healthCheck() {
    try {
      await this.getBlockCount();
      return true;
    } catch {
      return false;
    }
  }
}

const explorerClient = new B1TExplorerClient();

export default explorerClient;


