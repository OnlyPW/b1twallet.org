import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000, // Increased timeout for image processing
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
  deriveAddress: (mnemonic, index = 0, change = 0, account = 0) =>
    api.post('/api/wallet/derive-address', { mnemonic, index, change, account }),

  deriveAddresses: (mnemonic, count = 5, change = 0, startIndex = 0, account = 0) =>
    api.post('/api/wallet/derive-addresses', { mnemonic, count, change, startIndex, account }),

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

// Ordinals API
export const ordinalsApi = {
  getInscriptions: (address) => api.get(`/api/ordinals/inscriptions/${address}`),
  getOrdinal: (ordinalId) => api.get(`/api/ordinals/ordinal/${ordinalId}`),
  createInscription: (data) => api.post('/api/ordinals/create', data),
  getB1T20Tokens: (address) => api.get(`/api/ordinals/b1t20/${address}`),

  // New inscription APIs
  createTextInscription: (data) => api.post('/api/ordinals/create/text', data),
  createImageInscription: (formData) => api.post('/api/ordinals/create/image', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  estimateInscription: (data) => api.post('/api/ordinals/estimate', data),
  processImagePreview: (formData) => api.post('/api/ordinals/process-image', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
};

// B1T-20 Ordinals API (using working database-direct endpoints)
export const b1t20Api = {
  // Get B1T-20 service status
  getStatus: () => api.get('/api/b1t20/status'),

  // Deploy B1T-20 token (database-direct approach)
  deployToken: (data) => api.post('/api/b1t20/deploy-direct', {
    recipientAddress: data.recipientAddress,
    ticker: data.ticker,
    max: data.maxSupply || '1000000',
    lim: data.limit || '1000'
  }),

  // Mint B1T-20 token with metadata (using existing endpoint for now)
  mintTextInscription: (data) => api.post('/api/ordinals/b1t20/mint-image-with-metadata', {
    mnemonic: data.mnemonic,
    recipientAddress: data.recipientAddress,
    ticker: data.ticker,
    name: data.name || data.ticker.toUpperCase(),
    description: data.description || '',
    imageUrl: null // No image for text-only
  }),

  // Mint B1T-20 token with image and metadata
  mintImageInscription: (formData) => {
    // Convert FormData to JSON object with image URL
    const jsonData = {};
    formData.forEach((value, key) => {
      if (key === 'image') {
        // For images, we'll need to handle this differently
        jsonData.imageFile = value;
      } else {
        jsonData[key] = value;
      }
    });

    // For now, use the same endpoint but signal there's an image
    return api.post('/api/ordinals/b1t20/mint-image-with-metadata', {
      ...jsonData,
      imageUrl: '/app/compressed-ord1.jpg' // Default test image
    });
  },

  // Estimate B1T-20 inscription cost
  estimateB1T20Cost: (data) => api.post('/api/ordinals/b1t20/estimate/b1t20', {
    type: data.hasImage ? 'image' : 'text',
    content: data.description || data.ticker,
    name: data.name || data.ticker,
    description: data.description || ''
  }),
};

export default api;


