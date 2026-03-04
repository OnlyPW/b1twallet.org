import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet, Send, Download, RefreshCw, Eye, EyeOff, TrendingUp, Clock, Layers, Loader, Sparkles, X, ArrowRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { walletApi, getIndexerStatus } from '../services/api';
import { useTranslation } from 'react-i18next';
import useWalletStore from '../store/walletStore';
import Tokens from './Tokens';
import Ordinals from './Ordinals';

export default function Dashboard() {
  const navigate = useNavigate();
  const { isUnlocked, addresses, getCurrentAddress, setBalance, balance, transactions, setTransactions, setCurrentAddress } = useWalletStore();
  const { t, i18n } = useTranslation();
  
  const [loading, setLoading] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [addressDetails, setAddressDetails] = useState(null);
  const [indexer, setIndexer] = useState(null);
  const [live, setLive] = useState(null);
  const [xpub, setXpub] = useState(null);
  const [activeTab, setActiveTab] = useState('transactions');
  const [utxoCount, setUtxoCount] = useState(0);
  const [consolidating, setConsolidating] = useState(false);
  const pendingInRef = useRef(new Map());
  const prevOrdinalsCountRef = useRef(0);
  const [newOrdinalsCount, setNewOrdinalsCount] = useState(0);
  const [showOrdinalPopup, setShowOrdinalPopup] = useState(false);

  useEffect(() => {
    if (!isUnlocked) {
      navigate('/');
      return;
    }
    
    loadWalletData();
  }, [isUnlocked, navigate]);

  useEffect(() => {
    if (!isUnlocked || !addressDetails?.address) return;
    const id = setInterval(async () => {
      try {
        const lb = await walletApi.getLiveBalance(addressDetails.address);
        setLive(lb);
      } catch {}
    }, 10000);
    return () => clearInterval(id);
  }, [isUnlocked, addressDetails?.address]);

  useEffect(() => {
    if (!isUnlocked || !(addresses || []).length) return;

    const addrList = (addresses || []).map(a => a.address);
    addrList.forEach(a => { if (!pendingInRef.current.has(a)) pendingInRef.current.set(a, 0); });

    const id = setInterval(async () => {
      try {
        const results = await Promise.allSettled(addrList.map(addr => walletApi.getLiveBalance(addr, 300)));
        results.forEach((r, i) => {
          if (r.status !== 'fulfilled') return;
          const data = r.value || {};
          const pendingIn = (data.pending && typeof data.pending.in === 'number') ? data.pending.in : 0;
          const prev = pendingInRef.current.get(addrList[i]) || 0;
          const delta = Number(pendingIn) - Number(prev);
          if (delta > 0) {
            pendingInRef.current.set(addrList[i], pendingIn);
            const idx = addresses[i]?.index ?? i;
            toast.success(t('mempool.toast.incoming', { delta: delta.toFixed(8), index: idx }));
          } else {
            pendingInRef.current.set(addrList[i], pendingIn);
          }
        });
      } catch {}
    }, 12000);

    return () => clearInterval(id);
  }, [isUnlocked, addresses]);

  useEffect(() => {
    if (!isUnlocked || !(addresses || []).length) return;

    const checkNewOrdinals = async () => {
      try {
        const allInsc = [];
        const seen = new Set();
        for (const addr of addresses) {
          try {
            const res = await walletApi.getInscriptions(addr.address);
            if (res.success && res.inscriptions) {
              for (const insc of res.inscriptions) {
                const key = insc.ord_id || insc.inscription_txid;
                if (!seen.has(key)) {
                  seen.add(key);
                  allInsc.push(insc);
                }
              }
            }
          } catch {}
        }

        const currentCount = allInsc.length;
        const prevCount = prevOrdinalsCountRef.current;

        if (prevCount > 0 && currentCount > prevCount) {
          const newCount = currentCount - prevCount;
          setNewOrdinalsCount(newCount);
          setShowOrdinalPopup(true);
        }

        prevOrdinalsCountRef.current = currentCount;
      } catch {}
    };

    const id = setInterval(checkNewOrdinals, 45000);
    checkNewOrdinals();

    return () => clearInterval(id);
  }, [isUnlocked, addresses]);

  const loadWalletData = async () => {
    setLoading(true);
    try {
      const current = getCurrentAddress();
      if (!current) {
        navigate('/');
        return;
      }
      
      const details = await walletApi.getAddress(current.address);
      setAddressDetails(details);
      setBalance(details.balance || 0);
      setTransactions(details.transactions || []);
      setCurrentAddress(current.index);
      
      const utxos = await walletApi.getUtxos(current.address);
      setUtxoCount(utxos.length || 0);

      try {
        const xp = useWalletStore.getState().getXpub();
        setXpub(xp);
      } catch {}

      try {
        const ix = await getIndexerStatus();
        setIndexer(ix);
      } catch (e) {
        console.warn(t('dashboard.indexerUnavailable'), e.message);
      }

    } catch (error) {
      toast.error(t('dashboard.loadError', { message: error.message }));
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return t('common.notAvailable');
    return new Date(timestamp * 1000).toLocaleString(i18n.language || 'en');
  };

  const formatAmount = (amount) => {
    if (typeof amount !== 'number') return '0.00000000';
    return amount.toFixed(8);
  };

  const handleConsolidate = async () => {
    const state = useWalletStore.getState();
    const addrIdx = state.currentAddressIndex || 0;
    const wif = state.getWIF(addrIdx);
    const addr = state.getCurrentAddress()?.address;
    if (!wif || !addr) {
      toast.error(t('inscribe.walletLocked'));
      return;
    }
    setConsolidating(true);
    try {
      const res = await walletApi.consolidateUtxos({ wif, address: addr });
      if (res.success && res.txid) {
        toast.success(t('consolidate.success', { count: res.inputCount, amount: res.consolidatedB1T?.toFixed(2) }));
        setTimeout(() => loadWalletData(), 3000);
      } else if (res.success && res.message) {
        toast.success(t('consolidate.alreadyDone'));
      }
    } catch (err) {
      toast.error(t('consolidate.error', { message: err.message }));
    } finally {
      setConsolidating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Beta Notice */}
      <div className="bg-b1t-orange/10 border border-b1t-orange/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-b1t-orange flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-b1t-orange mb-1">{t('beta.title')}</h3>
            <p className="text-sm text-gray-300">{t('beta.message')}</p>
          </div>
        </div>
      </div>

      {/* Indexer Status */}
      {indexer && (
        <div className="card bg-dark-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${indexer.ok ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-400">{t('indexer.label')}</span>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-sm">{t('indexer.currentHeight')}</p>
              <p className="font-mono text-sm">{indexer?.chainTip ?? t('common.notAvailable')}</p>
            </div>
          </div>
        </div>
      )}

      {/* New Ordinals Discovered Popup */}
      <AnimatePresence>
        {showOrdinalPopup && newOrdinalsCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="card bg-gradient-to-r from-purple-600/20 to-b1t-orange/20 border-purple-500/50"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-purple-500/30">
                  <Sparkles size={24} className="text-purple-300" />
                </div>
                <div>
                  <p className="font-semibold text-white flex items-center gap-2">
                    {t('ordinals.newDiscovered')}
                  </p>
                  <p className="text-sm text-gray-300">
                    {t('ordinals.newDiscoveredDesc', { count: newOrdinalsCount })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setActiveTab('ordinals');
                    setShowOrdinalPopup(false);
                    setNewOrdinalsCount(0);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/30 hover:bg-purple-500/50 text-white text-sm transition"
                >
                  {t('ordinals.viewOrdinals')}
                  <ArrowRight size={16} />
                </button>
                <button
                  onClick={() => {
                    setShowOrdinalPopup(false);
                    setNewOrdinalsCount(0);
                  }}
                  className="p-2 rounded-lg hover:bg-dark-200 text-gray-400 hover:text-white transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card bg-gradient-orange text-white relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 opacity-10">
          <Wallet size={200} />
        </div>
        
        <div className="relative z-10 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white/80 text-sm mb-1">{t('balance.available')}</p>
              <div className="flex items-center space-x-3">
                {showBalance ? (
                  <h2 className="text-5xl font-bold">{formatAmount(live?.balances?.available ?? balance)} B1T</h2>
                ) : (
                  <h2 className="text-5xl font-bold">••••••••</h2>
                )}
                <button
                  onClick={() => setShowBalance(!showBalance)}
                  className="p-2 rounded-lg hover:bg-white/20 transition"
                  title={showBalance ? t('actions.hide') : t('actions.show')}
                >
                  {showBalance ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            <button
              onClick={loadWalletData}
              disabled={loading}
              className="p-3 rounded-lg bg-white/20 hover:bg-white/30 transition disabled:opacity-50"
              title={t('actions.refresh')}
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-white/60">{t('balance.confirmed')}</p>
              <p className="font-mono">{formatAmount(live?.balances?.confirmed ?? balance)}</p>
            </div>
            <div>
              <p className="text-white/60">{t('balance.pendingIn')}</p>
              <p className="font-mono">{formatAmount(live?.pending?.in || 0)}</p>
            </div>
            <div>
              <p className="text-white/60">{t('balance.pendingOut')}</p>
              <p className="font-mono">{formatAmount(live?.pending?.out || 0)}</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Link to="/send" className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Send size={18} />
              {t('quick.send.title')}
            </Link>
            <Link to="/receive" className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <Download size={18} />
              {t('quick.receive.title')}
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Address Info */}
      {addressDetails && (
        <div className="card bg-dark-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">{t('address.active')}</p>
              <p className="font-mono text-sm">{formatAddress(addressDetails.address)}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-sm">{t('dashboard.utxos')}</p>
              <p className="font-mono text-sm">{utxoCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-dark-200">
        <div className="flex gap-6">
          <button
            className={`px-4 py-2 text-lg font-semibold ${activeTab === 'transactions' ? 'text-b1t-orange border-b-2 border-b1t-orange' : 'text-gray-400'}`}
            onClick={() => setActiveTab('transactions')}
          >
            {t('tx.latest')}
          </button>
          <button
            className={`px-4 py-2 text-lg font-semibold ${activeTab === 'ordinals' ? 'text-b1t-orange border-b-2 border-b1t-orange' : 'text-gray-400'}`}
            onClick={() => setActiveTab('ordinals')}
          >
            {t('ordinals.title')}
          </button>
          <button
            className={`px-4 py-2 text-lg font-semibold ${activeTab === 'tokens' ? 'text-b1t-orange border-b-2 border-b1t-orange' : 'text-gray-400'}`}
            onClick={() => setActiveTab('tokens')}
          >
            {t('tokens.title')}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'transactions' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">{t('tx.latest')}</h3>
            <button onClick={loadWalletData} disabled={loading} className="btn-secondary text-sm">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>{t('tx.none')}</p>
              <p className="text-sm mt-2">{t('tx.none_subtitle')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...transactions]
                .sort((a, b) => ((b.time || b.blocktime || 0) - (a.time || a.blocktime || 0)))
                .slice(0, 5)
                .map((tx, index) => (
                <motion.div
                  key={tx.txid || index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-4 rounded-lg bg-dark-200 hover:bg-dark-100 transition"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <p className="font-mono text-sm text-gray-400">
                        {formatAddress(tx.txid)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(tx.time || tx.blocktime)}
                      </p>
                      <p className="text-xs text-gray-300">
                        {((tx.sent || 0) > 0) ? t('explorer.sent') : t('explorer.received')}: {formatAmount(((tx.sent || 0) > 0) ? tx.sent : (tx.received || 0))} B1T
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-b1t-orange">
                        {tx.confirmations >= 6 ? '✓' : '⏳'} {tx.confirmations || 0} {t('tx.confirmations')}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
      {activeTab === 'ordinals' && <Ordinals />}
      {activeTab === 'tokens' && <Tokens />}
    </div>
  );
}
