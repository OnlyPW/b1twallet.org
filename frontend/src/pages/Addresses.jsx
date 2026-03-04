import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Copy, Check, RefreshCw, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useWalletStore from '../store/walletStore';
import { walletApi } from '../services/api';
import { useTranslation } from 'react-i18next';

export default function Addresses() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    isUnlocked,
    addresses,
    currentAddressIndex,
    setCurrentAddress,
    setAddresses,
    getCurrentAddress,
  } = useWalletStore();

  const [balances, setBalances] = useState({});
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [addrLoading, setAddrLoading] = useState(false);

  useEffect(() => {
    if (!isUnlocked) {
      navigate('/');
      return;
    }
  }, [isUnlocked, navigate]);

  const shortAddr = (a) => a ? `${a.slice(0, 6)}…${a.slice(-6)}` : '';

  const loadBalances = async () => {
    if (!addresses || addresses.length === 0) return;
    setLoadingBalances(true);
    try {
      const results = await Promise.allSettled(addresses.map(a => walletApi.getBalance(a.address)));
      const map = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          const b = r.value.balance ?? r.value?.balances?.confirmed ?? 0;
          map[i] = Number(b) || 0;
        } else {
          map[i] = 0;
        }
      });
      setBalances(map);
      try {
        const nonZero = Object.entries(map).filter(([, v]) => (v || 0) > 0);
        if (nonZero.length > 0) {
          const [bestIdx] = nonZero.reduce((best, curr) => (curr[1] > best[1] ? curr : best));
          const currBal = map[currentAddressIndex] || 0;
          if ((currBal || 0) === 0 && currentAddressIndex !== Number(bestIdx)) {
            setCurrentAddress(Number(bestIdx));
            toast.success(t('addresses.autoActivated'));
          }
        }
      } catch {}
    } catch (e) {
      console.warn(t('addresses.loadFailed') + ':', e.message);
    } finally {
      setLoadingBalances(false);
    }
  };

  useEffect(() => { loadBalances(); }, [addresses]);

  const copyAddress = (address, i) => {
    try { navigator.clipboard.writeText(address); } catch {}
    setCopiedIndex(i);
    toast.success(t('addresses.copied'));
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const deriveMore = async (n = 5) => {
    try {
      setAddrLoading(true);
      const newAddrs = useWalletStore.getState().deriveMoreAddresses(n);
      if (newAddrs.length > 0) {
        toast.success(t('addresses.derived', { count: newAddrs.length }));
      } else {
        toast.error(t('addresses.walletLocked'));
        navigate('/');
      }
    } catch (e) {
      toast.error(t('addresses.deriveError') + ': ' + e.message);
    } finally {
      setAddrLoading(false);
    }
  };

  const active = useMemo(() => getCurrentAddress(), [getCurrentAddress, currentAddressIndex, addresses]);

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 bg-gradient-orange rounded-full">
            <Wallet size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold glow-text">{t('addresses.title')}</h1>
          <p className="text-gray-400">{t('addresses.subtitle')}</p>
        </div>

        <div className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-lg">{t('addresses.allAddresses')}</h3>
            <button onClick={loadBalances} disabled={loadingBalances}
              className="btn-secondary text-sm flex items-center gap-2">
              <RefreshCw size={16} className={loadingBalances ? 'animate-spin' : ''} />
              {t('addresses.refresh')}
            </button>
          </div>

          {addresses && addresses.length > 0 ? (
            <div className="space-y-2">
              {addresses.map((addr, i) => (
                <div key={i} 
                  className={`p-4 rounded-lg border-2 transition-all ${
                    i === currentAddressIndex 
                      ? 'border-b1t-orange bg-b1t-orange/10' 
                      : 'border-dark-200 bg-dark-200 hover:border-dark-100'
                  }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-b1t-orange font-semibold">#{i}</span>
                        {i === currentAddressIndex && (
                          <span className="text-xs bg-b1t-orange text-white px-2 py-0.5 rounded">
                            {t('addresses.active')}
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-sm">{shortAddr(addr.address)}</p>
                      <p className="text-sm text-gray-400 mt-1">
                        {t('addresses.balance')}: {(balances[i] || 0) / 1e8} B1T
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => copyAddress(addr.address, i)}
                        className="p-2 rounded-lg bg-dark-300 hover:bg-dark-100 transition">
                        {copiedIndex === i ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                      </button>
                      {i !== currentAddressIndex && (
                        <button onClick={() => setCurrentAddress(i)}
                          className="p-2 rounded-lg bg-b1t-orange hover:bg-b1t-orange-400 transition text-white">
                          {t('addresses.use')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">{t('addresses.none')}</p>
          )}

          <button onClick={() => deriveMore(5)} disabled={addrLoading}
            className="btn-secondary w-full flex items-center justify-center gap-2">
            <Plus size={16} />
            {addrLoading ? t('addresses.deriving') : t('addresses.deriveMore')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
