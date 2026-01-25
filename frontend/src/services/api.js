import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    const message = error.response?.data?.error || error.message || 'Unbekannter Fehler';
    return Promise.reject(new Error(message));
  }
);

// Wallet API
export const walletApi = {
  // Mnemonic
  generateMnemonic: (strength = 128) =>
    api.post('/api/wallet/generate-mnemonic', { strength }),

  validateMnemonic: (mnemonic) =>
    api.post('/api/wallet/validate-mnemonic', { mnemonic }),

  // XPUB
  deriveXpub: (mnemonic, account = 0) =>
    api.post('/api/wallet/derive-xpub', { mnemonic, account }),

  // Addresses
  deriveAddress: (mnemonic, index = 0, change = 0) =>
    api.post('/api/wallet/derive-address', { mnemonic, index, change }),

  deriveAddresses: (mnemonic, count = 5, change = 0, startIndex = 0) =>
    api.post('/api/wallet/derive-addresses', { mnemonic, count, change, startIndex }),

  // Balance & UTXOs
  getBalance: (address) =>
    api.get(`/api/wallet/balance/${address}`),

  getUtxos: (address) =>
    api.get(`/api/wallet/utxos/${address}`),

  getTransactions: (address, start = 0, limit = 10) =>
    api.get(`/api/wallet/transactions/${address}`, { params: { start, limit } }),

  // Live Balance with mempool
  getLiveBalance: (address, limit = 1000) =>
    api.get(`/api/wallet/live-balance/${address}`, { params: { limit } }),

  // Send
  sendTransaction: (data) =>
    api.post('/api/wallet/send', data),

  estimateFee: (blocks = 6) =>
    api.get('/api/wallet/estimate-fee', { params: { blocks } }),

  // Broadcast Raw Hex
  broadcastTransaction: (hex) =>
    api.post('/api/wallet/broadcast', { hex }),

  // Tokens
  getTokens: (address) =>
    api.get(`/api/ordinals/address/${address}/tokens`),

  // Rabb1ts Mining (with extended timeout for mining operations)
  getRabb1tsUtxos: (address) =>
    api.get(`/api/wallet/rabb1ts/utxo-details/${address}`),

  mineRabb1tsBatch: (data) =>
    api.post('/api/wallet/rabb1ts/mine-batch', data, { timeout: 120000 }), // 2 min timeout

  mineRabb1tsAttempt: (data) =>
    api.post('/api/wallet/rabb1ts/mine-attempt', data, { timeout: 60000 }), // 1 min timeout
};

// Health Check
export const healthCheck = () => api.get('/health');

export const testConnection = () => api.get('/api/test-connection');

// Indexer Status
export const getIndexerStatus = () => api.get('/api/indexer-status');

// Explorer API
export const explorerApi = {
  search: (q) => api.get('/api/explorer/search', { params: { q } }),
  getAddress: (address) => api.get(`/api/explorer/address/${address}`),
  getTx: (txid) => api.get(`/api/explorer/tx/${txid}`),
  getBlock: (hashOrHeight) => api.get(`/api/explorer/block/${hashOrHeight}`),
};

// Mempool API
export const mempoolApi = {
  getInfo: () => api.get('/api/mempool/info'),
  getList: (limit = 500, verbose = false) => api.get('/api/mempool/list', { params: { limit, verbose } }),
  getTx: (txid) => api.get(`/api/mempool/tx/${txid}`),
  getEntry: (txid) => api.get(`/api/mempool/entry/${txid}`),
};

export const remoteLog = (level, message, data) =>
  api.post('/api/debug/log', { level, message, data }).catch(() => { });

export default api;
