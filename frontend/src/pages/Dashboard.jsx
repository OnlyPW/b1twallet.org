import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet, Send, Download, RefreshCw, Eye, EyeOff, TrendingUp, Clock, Layers, Loader, Sparkles, X, ArrowRight } from 'lucide-react';
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
    try {
      setLoading(true);
      let currentAddr = getCurrentAddress();
      
      if (!currentAddr) {
        toast.error(t('send.toast.noAddress'));
        return;
      }

      try {
        const xp = useWalletStore.getState().getXpub();
        if (xp) setXpub(xp);
      } catch {}

      const addrs = (addresses || []).map(a => a.address);
      const allAddresses = addrs.length > 0 ? addrs : [currentAddr.address];

      const balanceResults = await Promise.allSettled(
        allAddresses.map((addr) => walletApi.getBalance(addr))
      );
      let totalBalance = 0;
      const balanceMap = {};
      for (let i = 0; i < balanceResults.length; i++) {
        const r = balanceResults[i];
        if (r.status === 'fulfilled') {
          const b = r.value?.balance ?? r.value?.balances?.confirmed ?? 0;
          const num = typeof b === 'string' ? parseFloat(b) || 0 : (b || 0);
          totalBalance += num;
          balanceMap[allAddresses[i]] = num;
        } else {
          balanceMap[allAddresses[i]] = 0;
        }
      }
      setBalance(totalBalance);

      let switched = false;
      try {
        const currentBal = balanceMap[currentAddr.address] || 0;
        if ((currentBal || 0) === 0 && (addresses || []).length > 0) {
          let bestIdx = null;
          let bestBal = 0;
          addresses.forEach((a, i) => {
            const bal = balanceMap[a.address] || 0;
            if (bal > bestBal) { bestBal = bal; bestIdx = i; }
          });
          if (bestIdx !== null && bestBal > 0 && bestIdx !== getCurrentAddress()?.index) {
            setCurrentAddress(bestIdx);
            currentAddr = addresses[bestIdx];
            switched = true;
          }
        }
      } catch {}

      setAddressDetails(currentAddr);

      try {
        const lb = await walletApi.getLiveBalance(currentAddr.address);
        setLive(lb);
      } catch {
        setLive(null);
      }

      try {
        const utxoRes = await walletApi.getUtxos(currentAddr.address);
        const utxoList = utxoRes?.utxos || utxoRes || [];
        setUtxoCount(Array.isArray(utxoList) ? utxoList.length : 0);
      } catch {
        setUtxoCount(0);
      }

      const txResults = await Promise.allSettled(
        allAddresses.map((addr) => walletApi.getTransactions(addr, 0, 20))
      );
      const txMap = new Map();
      for (const r of txResults) {
        if (r.status !== 'fulfilled') continue;
        const list = r.value?.transactions || [];
        for (const tx of list) {
          const existing = txMap.get(tx.txid);
          if (!existing) {
            txMap.set(tx.txid, { ...tx });
          } else {
            txMap.set(tx.txid, {
              ...existing,
              sent: (existing.sent || 0) + (tx.sent || 0),
              received: (existing.received || 0) + (tx.received || 0),
              confirmations: Math.max(existing.confirmations || 0, tx.confirmations || 0),
              time: existing.time || tx.time || existing.blocktime || tx.blocktime,
              blocktime: existing.blocktime || tx.blocktime || existing.time || tx.time,
            });
          }
        }
      }
      const aggregated = Array.from(txMap.values())
        .sort((a, b) => ((b.time || b.blocktime || 0) - (a.time || a.blocktime || 0)));
      setTransactions(aggregated);

      try {
        const ix = await getIndexerStatus();
        setIndexer(ix);
      } catch (e) {
        console.warn('Indexer-Status nicht verfügbar:', e.message);
      }

    } catch (error) {
      toast.error(`Fehler beim Laden: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
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

  if (!isUnlocked || !addressDetails) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-b1t-orange"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-2"
      >
        <h1 className="text-4xl font-bold glow-text">{t('dashboard.title')}</h1>
        <p className="text-gray-400">{t('dashboard.welcome')}</p>
      </motion.div>

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-gray-400 text-sm">{t('indexer.label')}</p>
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {indexer ? (
                  indexer.enabled ? (indexer.status === 'caught_up' ? t('indexer.status.caught_up') : t('indexer.status.syncing')) : t('indexer.status.disabled')
                ) : t('indexer.status.unknown')}
              </span>
              {indexer && indexer.enabled && indexer.status === 'syncing' && (
                <span className="animate-spin inline-block h-3 w-3 border-2 border-b1t-orange border-t-transparent rounded-full" />
              )}
            </div>
            {indexer && indexer.enabled && (
              <div className="mt-2">
                <p className="font-mono text-xs text-gray-500">
                  {t('indexer.dbTip')}: {indexer.dbTip ?? '-'} / {t('indexer.chainTip')}: {indexer.chainTip ?? '-'} ({indexer.progress ?? 0}%)
                </p>
                <div className="h-2 bg-dark-200 rounded mt-1">
                  <div
                    className="h-2 bg-b1t-orange rounded"
                    style={{ width: `${Math.min(100, indexer.progress || 0)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-sm">{t('indexer.currentHeight')}</p>
            <p className="font-mono text-sm">{indexer?.chainTip ?? 'N/A'}</p>
          </div>
        </div>
      </div>

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
                >
                  {showBalance ? <Eye size={20} /> : <EyeOff size={20} />}
                </button>
              </div>
            </div>

            <button
              onClick={loadWalletData}
              disabled={loading}
              className="p-3 rounded-lg bg-white/20 hover:bg-white/30 transition"
              title={t('actions.refresh')}
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="pt-4 border-t border-white/20">
            <p className="text-white/80 text-sm mb-2">{t('address.active')}</p>
            <p className="font-mono text-sm">{addressDetails.address}</p>
            {xpub && (
              <div className="mt-2">
                <p className="text-white/80 text-sm">XPUB</p>
                <a
                  href={`https://blockbook.b1tcore.org/xpub/${xpub}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-white underline hover:text-orange-200"
                >
                  {xpub}
                </a>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
              <div className="bg-white/10 rounded p-2">
                <p className="text-xs text-white/70">{t('balance.total')}</p>
                <p className="font-mono text-sm">{formatAmount(balance)} B1T</p>
              </div>
              <div className="bg-white/10 rounded p-2">
                <p className="text-xs text-white/70">{t('balance.pendingIn')}</p>
                <p className="font-mono text-sm">{formatAmount(live?.pending?.in ?? 0)} B1T</p>
              </div>
              <div className="bg-white/10 rounded p-2">
                <p className="text-xs text-white/70">{t('balance.pendingOut')}</p>
                <p className="font-mono text-sm">{formatAmount(live?.pending?.out ?? 0)} B1T</p>
              </div>
              <div className="bg-white/10 rounded p-2">
                <p className="text-xs text-white/70">{t('balance.effective')}</p>
                <p className="font-mono text-sm">{formatAmount(live?.balances?.effective ?? balance)} B1T</p>
              </div>
            </div>
          </div>
      </div>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-4">
        <Link
          to="/send"
          className="card hover:border-b1t-orange transition-all group"
        >
          <div className="flex items-center space-x-4">
            <div className="p-4 rounded-full bg-gradient-orange text-white group-hover:scale-110 transition-transform">
              <Send size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{t('quick.send.title')}</h3>
              <p className="text-gray-400 text-sm">{t('quick.send.subtitle')}</p>
            </div>
          </div>
        </Link>

        <Link
          to="/receive"
          className="card hover:border-b1t-orange transition-all group"
        >
          <div className="flex items-center space-x-4">
            <div className="p-4 rounded-full bg-gradient-orange text-white group-hover:scale-110 transition-transform">
              <Download size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{t('quick.receive.title')}</h3>
              <p className="text-gray-400 text-sm">{t('quick.receive.subtitle')}</p>
            </div>
          </div>
        </Link>
      </div>

      {/* UTXO Consolidation hint */}
      {utxoCount > 3 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="card bg-dark-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Layers size={20} className="text-b1t-orange flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">{t('consolidate.hint', { count: utxoCount })}</p>
              <p className="text-xs text-gray-400">{t('consolidate.hintDesc')}</p>
            </div>
          </div>
          <button
            onClick={handleConsolidate}
            disabled={consolidating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-orange text-white text-sm whitespace-nowrap disabled:opacity-50"
          >
            {consolidating ? <Loader size={16} className="animate-spin" /> : <Layers size={16} />}
            {consolidating ? t('consolidate.running') : t('consolidate.button')}
          </button>
        </motion.div>
      )}

      {/* Tab Navigation for Transactions and Tokens */}
      <div className="flex border-b border-dark-200">
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

      {/* Conditional Rendering based on Active Tab */}
      {activeTab === 'transactions' && (
        <div className="card space-y-4">
          {transactions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <TrendingUp size={48} className="mx-auto mb-4 opacity-50" />
              <p>{t('tx.none')}</p>
              <p className="text-sm">{t('tx.none_subtitle')}</p>
            </div>
          ) : (
            <div className="space-y-2">
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
                      {tx.memo && (
                        <p className="text-xs text-b1t-orange break-all flex items-start gap-1" title={tx.memo}>
                          <span aria-hidden>📝</span><span>{tx.memo}</span>
                        </p>
                      )}
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
