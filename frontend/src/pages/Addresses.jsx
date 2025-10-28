import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Copy, Check, RefreshCw, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useWalletStore from '../store/walletStore';
import { walletApi } from '../services/api';

export default function Addresses() {
  const navigate = useNavigate();
  const {
    isUnlocked,
    addresses,
    currentAddressIndex,
    setCurrentAddress,
    setAddresses,
    getCurrentAddress,
  } = useWalletStore();

  const [balances, setBalances] = useState({}); // index -> number
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
      // Auto-aktivieren: wähle die Adresse mit dem höchsten Guthaben (>0)
      try {
        const nonZero = Object.entries(map).filter(([, v]) => (v || 0) > 0);
        if (nonZero.length > 0) {
          const [bestIdx] = nonZero.reduce((best, curr) => (curr[1] > best[1] ? curr : best));
          const currBal = map[currentAddressIndex] || 0;
          // Nur automatisch wechseln, wenn die aktuelle Adresse kein Guthaben hat
          if ((currBal || 0) === 0 && currentAddressIndex !== Number(bestIdx)) {
            setCurrentAddress(Number(bestIdx));
            toast.success('Adresse mit Guthaben automatisch aktiviert');
          }
        }
      } catch {}
    } catch (e) {
      console.warn('Balance-Ladung fehlgeschlagen:', e.message);
    } finally {
      setLoadingBalances(false);
    }
  };

  useEffect(() => { loadBalances(); }, [addresses]);

  const copyAddress = (address, i) => {
    try { navigator.clipboard.writeText(address); } catch {}
    setCopiedIndex(i);
    toast.success('Adresse kopiert!');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const deriveMore = async (n = 5) => {
    let mnemonic = null;
    try { mnemonic = localStorage.getItem('b1t_mnemonic'); } catch {}
    if (!mnemonic) {
      toast.error('Wallet ist gesperrt. Bitte neu importieren.');
      navigate('/');
      return;
    }
    try {
      setAddrLoading(true);
      const startIndex = addresses.length;
      const res = await walletApi.deriveAddresses(mnemonic, n, 0, startIndex);
      const newAddrs = res.addresses || [];
      if (newAddrs.length > 0) {
        setAddresses([...(addresses || []), ...newAddrs]);
        toast.success(`${newAddrs.length} neue Adressen abgeleitet`);
      } else {
        toast.error('Keine neuen Adressen abgeleitet');
      }
    } catch (e) {
      toast.error(`Fehler beim Ableiten: ${e.message}`);
    } finally {
      setAddrLoading(false);
    }
  };

  const active = useMemo(() => getCurrentAddress(), [getCurrentAddress, currentAddressIndex, addresses]);

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 bg-gradient-orange rounded-full">
            <Wallet size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold glow-text">Adressen</h1>
          <p className="text-gray-400">Verwalten Sie Ihre abgeleiteten Empfangsadressen</p>
        </div>

        {/* Active Address */}
        <div className="card space-y-3">
          <h3 className="font-semibold">Aktive Adresse</h3>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{active?.address || '—'}</span>
            {active?.address && (
              <button className="p-2 rounded bg-dark-300 hover:bg-dark-200" onClick={() => copyAddress(active.address, -1)}>
                <Copy size={16} />
              </button>
            )}
          </div>
          <div className="text-xs text-gray-500">Index: {active?.index ?? '—'}</div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={loadBalances} disabled={loadingBalances}>
            <RefreshCw size={16} className="inline mr-2" />
            {loadingBalances ? 'Lade Guthaben…' : 'Guthaben aktualisieren'}
          </button>
          <button className="btn-primary" onClick={() => deriveMore(5)} disabled={addrLoading}>
            <Plus size={16} className="inline mr-2" />
            {addrLoading ? 'Leite ab…' : 'Mehr Adressen ableiten'}
          </button>
        </div>

        {/* Address List */}
        <div className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Ihre Adressen</h3>
            <div className="text-sm text-gray-400">Gesamt: {addresses?.length || 0}</div>
          </div>
          <div className="space-y-3">
            {(addresses || []).map((a, i) => (
              <div key={i} className={`p-4 rounded border ${i === currentAddressIndex ? 'border-b1t-orange bg-dark-300' : 'border-dark-200 bg-dark-200'}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-gray-400">Index {i}</div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{a.address}</span>
                      <button className="p-2 rounded bg-dark-300 hover:bg-dark-200" onClick={() => copyAddress(a.address, i)}>
                        {copiedIndex === i ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                      </button>
                    </div>
                    <div className="text-xs text-gray-400">Pfad: {a.path}</div>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="text-sm">Guthaben: <span className="font-semibold text-b1t-orange">{Number(balances[i] || 0).toFixed(8)} B1T</span></div>
                    <button className="btn-secondary text-xs" onClick={() => setCurrentAddress(i)}>
                      Als aktiv setzen
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {(addresses || []).length === 0 && (
              <p className="text-sm text-gray-400">Noch keine Adressen. Bitte Wallet erstellen oder importieren.</p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}