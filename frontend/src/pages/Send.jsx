import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Send as SendIcon, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { walletApi } from '../services/api';
import useWalletStore from '../store/walletStore';
import { useTranslation } from 'react-i18next';

export default function Send() {
  const navigate = useNavigate();
  const { isUnlocked, getCurrentAddress, addresses, currentAddressIndex, setCurrentAddress } = useWalletStore();
  const { t } = useTranslation();
  
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState(0.0001);
  const [loading, setLoading] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState(null);
  const [minFee, setMinFee] = useState(0.0001);
  const [fromIndex, setFromIndex] = useState(0); // -1 bedeutet: Alle Adressen
  const [availableBalance, setAvailableBalance] = useState(0);
  const [balances, setBalances] = useState([]); // pro Adresse
  const [onlyFunded, setOnlyFunded] = useState(false);

  useEffect(() => {
    if (!isUnlocked) {
      navigate('/');
      return;
    }
    setFromIndex(currentAddressIndex || 0);
    loadFeeEstimate();
  }, [isUnlocked, navigate]);

  // Lade Salden für alle Adressen (zur Anzeige im Dropdown)
  useEffect(() => {
    const loadAllBalances = async () => {
      try {
        const list = addresses || [];
        const results = await Promise.allSettled(list.map(a => walletApi.getBalance(a.address)));
        const next = results.map((r, i) => {
          if (r.status !== 'fulfilled') return 0;
          const v = r.value;
          const b = v.balance ?? v?.balances?.available ?? v?.balances?.confirmed ?? 0;
          return Number(b) || 0;
        });
        setBalances(next);
      } catch (e) {
        setBalances([]);
      }
    };
    if ((addresses || []).length) loadAllBalances();
  }, [addresses]);

  // Lade verfügbares Guthaben je nach Auswahl (einzelne Adresse oder alle)
  useEffect(() => {
    const addrList = addresses || [];
    if (fromIndex === -1) {
      // Alle Adressen
      const total = (balances || []).reduce((sum, b) => sum + (Number(b) || 0), 0);
      setAvailableBalance(total);
      return;
    }
    const addr = addrList?.[fromIndex];
    if (!addr) { setAvailableBalance(0); return; }
    const load = async () => {
      try {
        const res = await walletApi.getBalance(addr.address);
        const b = res.balance ?? res?.balances?.available ?? res?.balances?.confirmed ?? 0;
        setAvailableBalance(Number(b) || 0);
      } catch (e) {
        setAvailableBalance(0);
      }
    };
    load();
  }, [addresses, fromIndex, balances]);

  const loadFeeEstimate = async () => {
    try {
      const feeData = await walletApi.estimateFee(6);
      if (feeData.success) {
        const suggested = typeof feeData.fee === 'number' && feeData.fee > 0 ? feeData.fee : 0.0001;
        const minVal = typeof feeData.minFee === 'number' && feeData.minFee > 0 ? feeData.minFee : 0.0001;
        setEstimatedFee(suggested);
        setMinFee(minVal);
        setFee(Math.max(suggested, minVal));
      }
    } catch (error) {
      console.error('Fee estimation failed:', error);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    
    const addrList = addresses || [];
    const selectedAddr = addrList?.[fromIndex] || getCurrentAddress();
    if (!selectedAddr && fromIndex !== -1) {
      toast.error(t('send.toast.noAddress'));
      return;
    }

    let mnemonic = null;
    try { mnemonic = localStorage.getItem('b1t_mnemonic'); } catch {}
    if (!mnemonic) {
      toast.error(t('send.toast.locked'));
      navigate('/');
      return;
    }

    try {
      setLoading(true);

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        toast.error(t('send.toast.invalidAmount'));
        return;
      }

      if (amountNum + fee > availableBalance) {
        toast.error(t('send.toast.insufficient'));
        return;
      }

      let response;
      if (fromIndex === -1) {
        // Sende aus allen Adressen (Multi-Input)
        const fromAddresses = (addresses || []).map(a => a.address);
        const addressIndices = (addresses || []).map(a => a.index);
        response = await walletApi.sendTransaction({
          mnemonic,
          useAll: true,
          fromAddresses,
          addressIndices,
          toAddress,
          amount: amountNum,
          fee,
          changeIndex: addressIndices[0] ?? 0,
        });
      } else {
        response = await walletApi.sendTransaction({
          mnemonic,
          fromAddress: selectedAddr.address,
          toAddress,
          amount: amountNum,
          fee,
          addressIndex: selectedAddr.index ?? fromIndex,
        });
      }

      if (response.success) {
        toast.success(t('send.toast.sent', { txid: `${String(response.txid || '').slice(0, 16)}...` }));
        setToAddress('');
        setAmount('');
        setTimeout(() => navigate('/dashboard'), 2000);
      }
    } catch (error) {
      toast.error(t('send.toast.genericError', { message: error.message }));
    } finally {
      setLoading(false);
    }
  };

  const setMaxAmount = () => {
    const maxAmount = Math.max(0, availableBalance - fee);
    setAmount(maxAmount.toFixed(8));
  };

  const formatShort = (addr) => `${addr.slice(0, 8)}...${addr.slice(-8)}`;

  const visibleAddresses = (addresses || []).map((a, i) => ({ ...a, balance: Number(balances[i] || 0), i }))
    .filter(a => !onlyFunded || (a.balance > 0));

  const totalBalance = (balances || []).reduce((sum, b) => sum + (Number(b) || 0), 0);

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 bg-gradient-orange rounded-full">
            <SendIcon size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold glow-text">{t('send.title')}</h1>
          <p className="text-gray-400">
            {t('send.available')}: <span className="text-b1t-orange font-semibold">{availableBalance.toFixed(8)} B1T</span>
          </p>
        </div>

        <form onSubmit={handleSend} className="space-y-6">
          <div className="card space-y-4">
            {/* From address selector */}
            <div>
              <label className="block text-sm font-semibold mb-2">{t('send.fromLabel')}</label>
              <div className="flex items-center gap-3 mb-2">
                <label className="inline-flex items-center gap-2 text-xs text-gray-400">
                  <input type="checkbox" checked={onlyFunded} onChange={(e) => setOnlyFunded(e.target.checked)} />
                  {t('send.onlyFundedLabel')}
                </label>
              </div>
              <select
                value={fromIndex}
                onChange={(e) => {
                  const val = e.target.value;
                  const idx = parseInt(val, 10);
                  setFromIndex(idx);
                  if (idx >= 0) setCurrentAddress(idx);
                }}
                className="input"
              >
                {/* Option: Alle Adressen */}
                <option value={-1}>{t('send.allOption', { sum: totalBalance.toFixed(8) })}</option>
                {visibleAddresses.map((a) => (
                  <option key={a.i} value={a.i}>{t('send.addrItem', { i: a.i, short: formatShort(a.address), balance: a.balance.toFixed(8) })}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">{t('send.recipientLabel')}</label>
              <input
                type="text"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder={t('send.recipientPlaceholder')}
                className="input font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">{t('send.amountLabel')}</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.00000001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t('send.amountPlaceholder')}
                  className="input pr-20"
                  required
                />
                <button
                  type="button"
                  onClick={setMaxAmount}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs bg-b1t-orange rounded hover:bg-b1t-orange-600 transition"
                >
                  {t('send.max')}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                {t('send.feeLabel')}
              </label>
              <input
                type="number"
                step="0.00000001"
                value={fee}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setFee(isNaN(val) ? fee : Math.max(val, minFee));
                }}
                className="input"
              />
              {estimatedFee && (
                <p className="text-xs text-gray-400 mt-1">{t('send.feeSuggestionMinimum', { suggested: estimatedFee.toFixed(8), min: minFee.toFixed(8) })}</p>
              )}
            </div>

            <div className="p-3 rounded bg-dark-200 text-xs text-gray-400 flex items-center gap-2">
              <AlertCircle size={14} />
              <p>
                {t('send.cautionCover')}
              </p>
            </div>

            <div className="p-3 rounded bg-dark-200 text-xs text-gray-400">
              <p>
                {t('send.cautionIrreversible')}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !toAddress || !amount}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? t('send.submitting') : t('send.submit')}
          </button>
        </form>
      </motion.div>
    </div>
  );
}


