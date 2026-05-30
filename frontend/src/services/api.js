import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

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

  // Ordinals Inscription
  inscribeOrdinal: (data) =>
    api.post('/api/ordinals/inscribe', data, { timeout: 300000 }),

  inscribeOrdinalStream: (data, onEvent) => {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ ...data, stream: true });
      let finalResult = null;
      fetch(`${API_URL}/api/ordinals/inscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
        .then((response) => {
          if (!response.ok) {
            return response.json().then((err) => reject(new Error(err.error || 'Request failed')));
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          const processEvents = () => {
            reader.read().then(({ done, value }) => {
              if (done) {
                if (finalResult) {
                  resolve(finalResult);
                } else {
                  resolve({ success: true });
                }
                return;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              let currentEvent = '';
              for (const line of lines) {
                if (line.startsWith('event: ')) {
                  currentEvent = line.slice(7).trim();
                } else if (line.startsWith('data: ') && currentEvent) {
                  try {
                    const eventData = JSON.parse(line.slice(6));
                    onEvent(currentEvent, eventData);
                    if (currentEvent === 'complete') {
                      finalResult = eventData;
                    }
                    if (currentEvent === 'error') {
                      reject(new Error(eventData.error || 'Unknown error'));
                      return;
                    }
                  } catch (e) {
                    console.warn('SSE parse error:', e);
                  }
                }
              }
              processEvents();
            }).catch(err => {
              console.error('Reader error:', err);
              reject(err);
            });
          };
          processEvents();
        })
        .catch(reject);
    });
  },

  estimateInscription: (dataSize) =>
    api.post('/api/ordinals/estimate', { dataSize }),

  getInscriptions: (address) =>
    api.get(`/api/ordinals/address/${address}/inscriptions`),

  getInscriptionContentUrl: (txid) =>
    `${API_URL}/api/ordinals/content/${txid}`,

  transferInscription: (data) =>
    api.post('/api/ordinals/transfer', data, { timeout: 120000 }),

  syncOrdinals: () =>
    api.post('/api/ordinals/sync'),

  syncAddressOrdinals: (address) =>
    api.post(`/api/ordinals/sync/${address}`),

  // UTXO Consolidation
  consolidateUtxos: (data) =>
    api.post('/api/wallet/consolidate', data, { timeout: 60000 }),

  // Rabb1ts Mining (with extended timeout for mining operations)
  getRabb1tsUtxos: (address) =>
    api.get(`/api/wallet/rabb1ts/utxo-details/${address}`),

  mineRabb1tsBatch: (data) =>
    api.post('/api/wallet/rabb1ts/mine-batch', data, { timeout: 120000 }), // 2 min timeout

  mineRabb1tsAttempt: (data) =>
    api.post('/api/wallet/rabb1ts/mine-attempt', data, { timeout: 60000 }), // 1 min timeout

  // Nicknames
  checkNickname: (name) =>
    api.get(`/api/nicknames/check/${encodeURIComponent(name)}`),
  getNicknameInfo: (name) =>
    api.get(`/api/nicknames/info/${encodeURIComponent(name)}`),
  resolveNickname: (name) =>
    api.get(`/api/nicknames/resolve/${encodeURIComponent(name)}`),
  listNicknames: (params = {}) =>
    api.get('/api/nicknames/list', { params }),
  getMyNicknames: (pubkeys) =>
    api.post('/api/nicknames/my', { pubkeys }),
  registerNickname: (data) =>
    api.post('/api/nicknames/register', data),
  updateNickname: (data) =>
    api.post('/api/nicknames/update', data),
  transferNickname: (data) =>
    api.post('/api/nicknames/transfer', data),
  renewNickname: (data) =>
    api.post('/api/nicknames/renew', data),
  releaseNickname: (data) =>
    api.post('/api/nicknames/release', data),
  claimNicknameBond: (data) =>
    api.post('/api/nicknames/claim-bond', data),
  sendToNickname: (data) =>
    api.post('/api/nicknames/send', data),
  getBlockchainStatus: () =>
    api.get('/api/blockchain/status'),
};

// Health Check
export const healthCheck = () => api.get('/health');

export const testConnection = () => api.get('/api/test-connection');

// Indexer Status
export const getIndexerStatus = () => api.get('/api/indexer-status');

// Explorer API (Blockchain: block/tx/address search)
export const explorerApi = {
  search: (q) => api.get('/api/explorer/search', { params: { q } }),
  getLatestData: () => api.get('/api/explorer/latest-data'),
  getAddress: (address) => api.get(`/api/explorer/address/${address}`),
  getTx: (txid) => api.get(`/api/explorer/tx/${txid}`),
  getBlock: (hashOrHeight) => api.get(`/api/explorer/block/${hashOrHeight}`),
};

// Ordinals Explorer API (ord-indexer proxy)
export const ordinalsExplorerApi = {
  getStatus: () => api.get('/api/ordinals/explorer/status'),
  getLatestInscriptions: (page = 0) => api.get('/api/ordinals/explorer/inscriptions', { params: { page } }),
  getInscription: (id) => api.get(`/api/ordinals/explorer/inscription/${encodeURIComponent(id)}`),
  getAddressInscriptions: (address) => api.get(`/api/ordinals/explorer/address/${address}/inscriptions`),
  getInscriptionContentUrl: (id) => `${API_URL}/api/ordinals/explorer/inscription/${encodeURIComponent(id)}/content`,
};


// Mempool API
export const mempoolApi = {
  getInfo: () => api.get('/api/mempool/info'),
  getList: (limit = 500, verbose = false) => api.get('/api/mempool/list', { params: { limit, verbose } }),
  getTx: (txid) => api.get(`/api/mempool/tx/${txid}`),
  getEntry: (txid) => api.get(`/api/mempool/entry/${txid}`),
};

// Nicknames API
export const nicknamesApi = {
  check: (name) => api.get(`/api/nicknames/check/${encodeURIComponent(name)}`),
  getInfo: (name) => api.get(`/api/nicknames/info/${encodeURIComponent(name)}`),
  resolve: (name) => api.get(`/api/nicknames/resolve/${encodeURIComponent(name)}`),
  list: (params = {}) => api.get('/api/nicknames/list', { params }),
  my: (pubkeys) => api.post('/api/nicknames/my', { pubkeys }),
  register: (data) => api.post('/api/nicknames/register', data),
  update: (data) => api.post('/api/nicknames/update', data),
  transfer: (data) => api.post('/api/nicknames/transfer', data),
  renew: (data) => api.post('/api/nicknames/renew', data),
  release: (data) => api.post('/api/nicknames/release', data),
  claimBond: (data) => api.post('/api/nicknames/claim-bond', data),
  send: (data) => api.post('/api/nicknames/send', data),
};

export const remoteLog = (level, message, data) =>
  api.post('/api/debug/log', { level, message, data }).catch(() => { });

export default api;
