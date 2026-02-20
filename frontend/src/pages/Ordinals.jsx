import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { walletApi } from '../services/api';
import { useTranslation } from 'react-i18next';
import useWalletStore from '../store/walletStore';
import { Image, PenTool, Send, X, Loader, ExternalLink, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Ordinals() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addresses, currentAddressIndex } = useWalletStore();
  const [inscriptions, setInscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (addresses.length > 0) loadInscriptions();
  }, [addresses]);

  const loadInscriptions = async () => {
    setLoading(true);
    try {
      const allInsc = [];
      const seen = new Set();
      for (const addr of addresses) {
        try {
          const res = await walletApi.getInscriptions(addr.address);
          if (res.success && res.inscriptions) {
            for (const insc of res.inscriptions) {
              if (!seen.has(insc.inscription_txid)) {
                seen.add(insc.inscription_txid);
                allInsc.push(insc);
              }
            }
          }
        } catch {}
      }
      allInsc.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      setInscriptions(allInsc);
    } catch {}
    setLoading(false);
  };

  const handleTransfer = async () => {
    if (!selected || !transferTo.trim()) return;

    let mnemonic = null;
    try { mnemonic = localStorage.getItem('b1t_mnemonic'); } catch {}
    if (!mnemonic) {
      toast.error(t('inscribe.walletLocked'));
      return;
    }

    setTransferring(true);
    try {
      const res = await walletApi.transferInscription({
        mnemonic,
        addressIndex: currentAddressIndex || 0,
        inscriptionTxid: selected.inscription_txid,
        toAddress: transferTo.trim(),
      });
      if (res.success) {
        toast.success(t('ordinals.transferSuccess', { txid: res.txid.slice(0, 12) + '...' }));
        setTransferOpen(false);
        setTransferTo('');
        setSelected(null);
        loadInscriptions();
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      toast.error(t('ordinals.transferError', { message: err.message }));
    } finally {
      setTransferring(false);
    }
  };

  const copyTxid = (txid) => {
    navigator.clipboard.writeText(txid);
    toast.success(t('actions.copy'));
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString();
  };

  const formatShort = (s) => s ? `${s.slice(0, 8)}...${s.slice(-6)}` : '';

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[20vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-b1t-orange"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">{t('ordinals.title')}</h3>
        <Link
          to="/inscribe"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-orange text-white text-sm hover:opacity-90 transition"
        >
          <PenTool size={14} />
          {t('ordinals.createNew')}
        </Link>
      </div>

      {inscriptions.length === 0 ? (
        <div className="text-center py-12 text-gray-400 space-y-4">
          <Image size={48} className="mx-auto opacity-50" />
          <p>{t('ordinals.none')}</p>
          <Link
            to="/inscribe"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-orange text-white hover:opacity-90 transition"
          >
            <PenTool size={16} />
            {t('ordinals.createFirst')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {inscriptions.map((insc, index) => (
            <motion.div
              key={insc.inscription_txid}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className="card bg-dark-200 cursor-pointer hover:border-b1t-orange/50 transition group overflow-hidden"
              onClick={() => setSelected(insc)}
            >
              <div className="aspect-square bg-dark-300 rounded-lg overflow-hidden mb-3 flex items-center justify-center">
                {insc.content_type?.startsWith('image/') ? (
                  <img
                    src={walletApi.getInscriptionContentUrl(insc.inscription_txid)}
                    alt="Ordinal"
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <div className="text-center text-gray-500 p-4">
                    <p className="text-xs font-mono">{insc.content_type}</p>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-mono text-gray-400 truncate">{formatShort(insc.inscription_txid)}</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">{formatDate(insc.created_at)}</span>
                  <span className="text-xs text-b1t-orange">{(insc.data_size / 1024).toFixed(1)} KB</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail / Transfer Modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => { setSelected(null); setTransferOpen(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card bg-dark-400 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{t('ordinals.details')}</h3>
                <button onClick={() => { setSelected(null); setTransferOpen(false); }} className="p-2 rounded-lg hover:bg-dark-200 transition text-gray-400">
                  <X size={20} />
                </button>
              </div>

              {/* Preview */}
              <div className="bg-dark-300 rounded-lg overflow-hidden mb-4 flex items-center justify-center" style={{ minHeight: 200 }}>
                {selected.content_type?.startsWith('image/') ? (
                  <img
                    src={walletApi.getInscriptionContentUrl(selected.inscription_txid)}
                    alt="Ordinal"
                    className="max-w-full max-h-80 object-contain"
                  />
                ) : (
                  <div className="text-center text-gray-400 p-8">
                    <p className="font-mono text-sm">{selected.content_type}</p>
                    <p className="text-xs mt-2">{(selected.data_size / 1024).toFixed(1)} KB</p>
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">TXID:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-white truncate max-w-[200px]">{selected.inscription_txid}</span>
                    <button onClick={() => copyTxid(selected.inscription_txid)} className="text-gray-400 hover:text-white">
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('ordinals.contentType')}:</span>
                  <span className="font-mono text-xs text-white">{selected.content_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('ordinals.dataSize')}:</span>
                  <span className="font-mono text-white">{(selected.data_size / 1024).toFixed(1)} KB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('ordinals.owner')}:</span>
                  <span className="font-mono text-xs text-white">{formatShort(selected.to_address)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('ordinals.transactions')}:</span>
                  <span className="font-mono text-white">{selected.total_transactions}</span>
                </div>
                {selected.created_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('ordinals.date')}:</span>
                    <span className="text-white">{new Date(selected.created_at * 1000).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Transfer section */}
              {!transferOpen ? (
                <button
                  onClick={() => setTransferOpen(true)}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  {t('ordinals.transfer')}
                </button>
              ) : (
                <div className="space-y-3 p-4 rounded-lg bg-dark-300">
                  <h4 className="font-semibold text-sm">{t('ordinals.transferTo')}</h4>
                  <input
                    type="text"
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    placeholder={t('ordinals.transferPlaceholder')}
                    className="input font-mono text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setTransferOpen(false); setTransferTo(''); }}
                      className="flex-1 py-2 rounded-lg bg-dark-200 text-gray-400 hover:text-white transition"
                    >
                      {t('ordinals.cancel')}
                    </button>
                    <button
                      onClick={handleTransfer}
                      disabled={!transferTo.trim() || transferring}
                      className="flex-1 py-2 rounded-lg bg-gradient-orange text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {transferring ? (
                        <><Loader size={16} className="animate-spin" /> {t('ordinals.sending')}</>
                      ) : (
                        <><Send size={16} /> {t('ordinals.confirmTransfer')}</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
