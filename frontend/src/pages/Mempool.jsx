import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { mempoolApi } from '../services/api';

export default function Mempool() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [verbose, setVerbose] = useState(false);
  const [query, setQuery] = useState('');

  const formatTime = (ts) => {
    const n = Number(ts);
    if (!n || Number.isNaN(n)) return '—';
    try {
      const d = new Date(n * 1000);
      return d.toLocaleString();
    } catch { return '—'; }
  };

  const calcSatPerVByte = (feeCoins, size) => {
    const feeSats = typeof feeCoins === 'number' ? Math.round(feeCoins * 1e8) : NaN;
    const s = Number(size);
    if (!feeSats || !s) return '—';
    return Math.max(0, Math.round((feeSats / s) * 10) / 10);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [infoRes, listRes] = await Promise.all([
        mempoolApi.getInfo(),
        mempoolApi.getList(200, verbose),
      ]);
      setInfo(infoRes.info || infoRes);
      setItems(listRes.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [verbose]);

  const openTx = async (txid) => {
    try {
      setSelected({ txid, loading: true });
      const [raw, entryRes] = await Promise.all([
        mempoolApi.getTx(txid),
        mempoolApi.getEntry(txid).catch(() => ({ entry: null })),
      ]);
      setSelected({ txid, data: raw.tx || raw, entry: entryRes.entry || null, loading: false });
    } catch (e) {
      setSelected({ txid, error: e.message, loading: false });
    }
  };

  const filteredItems = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return items;
    if (verbose) {
      return items.filter((it) => String(it.txid || '').toLowerCase().includes(q));
    }
    return items.filter((txid) => String(txid || '').toLowerCase().includes(q));
  }, [items, query, verbose]);

  return (
    <div className="min-h-screen bg-dark-500 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <motion.h1
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold mb-6"
        >
          {t('mempool.title')}
        </motion.h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: List & Info */}
          <div className="space-y-6 lg:col-span-1">
            <div className="card bg-dark-400">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">{t('mempool.status')}</h2>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" className="accent-blue-400" checked={verbose} onChange={(e) => setVerbose(e.target.checked)} />
                    {t('mempool.verbose')}
                  </label>
                  <button className="btn-secondary text-xs" onClick={load} disabled={loading}>{loading ? t('mempool.loading') : t('mempool.refresh')}</button>
                </div>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-400">{t('mempool.size')}</p>
                  <p className="font-semibold">{info?.size ?? '—'}</p>
                </div>
                <div>
                  <p className="text-gray-400">{t('mempool.bytes')}</p>
                  <p className="font-semibold">{info?.bytes ?? '—'}</p>
                </div>
                <div>
                  <p className="text-gray-400">{t('mempool.usage')}</p>
                  <p className="font-semibold">{info?.usage ?? '—'}</p>
                </div>
                <div>
                  <p className="text-gray-400">{t('mempool.minFee')}</p>
                  <p className="font-semibold">{info?.mempoolminfee ?? '—'}</p>
                </div>
              </div>
            </div>

            <div className="card bg-dark-400">
              <h2 className="font-semibold mb-3">{t('mempool.txids')} ({filteredItems.length})</h2>
              <div className="mb-3">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('mempool.searchPlaceholder')}
                  className="w-full bg-dark-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="space-y-2 max-h-[480px] overflow-y-auto">
                {filteredItems.map((it) => {
                  const txid = verbose ? it.txid : it;
                  const feeRate = verbose ? calcSatPerVByte(it.fee, it.size) : null;
                  return (
                    <button key={txid} className="block w-full text-left p-2 rounded bg-dark-300 hover:bg-dark-200 font-mono text-xs" onClick={() => openTx(txid)}>
                      <div className="flex items-center justify-between">
                        <span>{txid}</span>
                        {verbose && (
                          <span className="text-[10px] text-gray-400">{t('mempool.feeRate')}: {feeRate} {t('mempool.satVB')}</span>
                        )}
                      </div>
                      {verbose && (
                        <div className="text-[10px] text-gray-500 mt-1">
                          {t('mempool.fee')}: {it.fee ?? '—'} • {t('mempool.size')}: {it.size ?? '—'} • {t('mempool.time')}: {formatTime(it.time)}
                        </div>
                      )}
                    </button>
                  );
                })}
                {filteredItems.length === 0 && (
                  <p className="text-sm text-gray-400">{t('mempool.none')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Right: RAW Detail */}
          <div className="lg:col-span-2">
            <div className="card bg-dark-400">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">{t('mempool.raw')}</h2>
                {selected?.txid && <span className="font-mono text-xs text-gray-400">{selected.txid}</span>}
              </div>
              {selected?.loading && <p className="text-sm text-gray-400">{t('mempool.loadingTx')}</p>}
              {selected?.error && <p className="text-sm text-red-400">{selected.error}</p>}
              {!selected?.loading && selected?.entry && (
                <div className="mb-4 p-3 rounded bg-dark-300">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-gray-400">{t('mempool.fee')}</p>
                      <p className="font-semibold">{selected.entry.fee ?? '—'} B1T</p>
                    </div>
                    <div>
                      <p className="text-gray-400">{t('mempool.feeRate')}</p>
                      <p className="font-semibold">{calcSatPerVByte(selected.entry.fee, selected.entry.size)} {t('mempool.satVB')}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">{t('mempool.size')}</p>
                      <p className="font-semibold">{selected.entry.size ?? '—'} B</p>
                    </div>
                    <div>
                      <p className="text-gray-400">{t('mempool.time')}</p>
                      <p className="font-semibold">{formatTime(selected.entry.time)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">{t('mempool.ancestors')}</p>
                      <p className="font-semibold">{selected.entry.ancestorcount ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">{t('mempool.descendants')}</p>
                      <p className="font-semibold">{selected.entry.descendantcount ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">{t('mempool.replaceable')}</p>
                      <p className="font-semibold">{String(selected.entry['bip125-replaceable']) === 'true' ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button className="btn-secondary text-xs" onClick={() => navigator.clipboard.writeText(selected.txid)}>{t('actions.copy')}</button>
                    <a className="btn-secondary text-xs" href={`${import.meta.env.VITE_API_URL}/api/explorer/tx/${selected.txid}`} target="_blank" rel="noreferrer">{t('mempool.openExplorer')}</a>
                  </div>
                </div>
              )}
              {!selected?.loading && selected?.data && (
                <pre className="bg-dark-300 p-4 rounded overflow-x-auto text-xs">{JSON.stringify(selected.data, null, 2)}</pre>
              )}
              {!selected && (
                <p className="text-sm text-gray-400">{t('mempool.selectPrompt')}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}