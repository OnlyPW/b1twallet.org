import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Blocks, Hash, Wallet, Copy, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { explorerApi } from '../services/api';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Explorer() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inputsResolved, setInputsResolved] = useState([]);
  const [inputsLoading, setInputsLoading] = useState(false);

  const onSearch = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const term = q.trim();
      const r = await explorerApi.search(term);
      // Update URL for deep-linking
      navigate(`/explorer?q=${encodeURIComponent(term)}`, { replace: true });
      setResult(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    return new Date(ts * 1000).toLocaleString(i18n.language || 'en');
  };

  const formatAmount = (amount) => {
    if (typeof amount !== 'number') return '0.00000000';
    return amount.toFixed(8);
  };

  const shortAddr = (addr) => {
    if (!addr || typeof addr !== 'string') return 'unknown';
    return `${addr.slice(0, 8)}...${addr.slice(-8)}`;
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const openSearch = (term) => {
    setQ(term);
    onSearch();
  };

  // Load from URL param
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initial = (params.get('q') || '').trim();
    if (initial && initial !== q) {
      setQ(initial);
      // Trigger search without requiring submit
      (async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
          const r = await explorerApi.search(initial);
          setResult(r);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Resolve input addresses for transaction view by fetching previous outputs
  useEffect(() => {
    const resolveInputs = async () => {
      if (result?.type !== 'tx') return;
      const vins = Array.isArray(result.tx?.vin) ? result.tx.vin : [];
      if (vins.length === 0) {
        setInputsResolved([]);
        return;
      }
      setInputsLoading(true);
      try {
        const tasks = vins.map(async (v) => {
          if (v?.coinbase) return { coinbase: true };
          if (!v?.txid || typeof v?.vout !== 'number') return { txid: v?.txid || null };
          try {
            const prev = await explorerApi.getTx(v.txid);
            const prevOut = prev?.tx?.vout?.[v.vout];
            const addr = prevOut?.scriptPubKey?.addresses?.[0] || prevOut?.addr || null;
            const value = typeof prevOut?.value === 'number' ? prevOut.value : null;
            return { txid: v.txid, vout: v.vout, addr, value };
          } catch {
            return { txid: v.txid, vout: v.vout };
          }
        });
        const resolved = await Promise.all(tasks);
        setInputsResolved(resolved);
      } finally {
        setInputsLoading(false);
      }
    };
    resolveInputs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.type, result?.txid]);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
        <h1 className="text-4xl font-bold glow-text">{t('nav.explorer')}</h1>
        <p className="text-gray-400">{t('explorer.searchHint')}</p>
      </motion.div>

      <form onSubmit={onSearch} className="flex gap-2">
        <input
          className="input"
          placeholder={t('explorer.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn-primary flex items-center gap-2" disabled={loading}>
          <Search size={18} /> {loading ? '...' : t('actions.refresh')}
        </button>
      </form>

      {error && (
        <div className="card text-red-300 border-red-400/30">{error}</div>
      )}

      {result && (
        <div className="card space-y-6">
          {result.type === 'address' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Wallet size={20} className="text-b1t-orange" />
                <span className="font-mono text-sm">{result.address}</span>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => copyToClipboard(result.address)}>
                  <Copy size={14} /> {copied ? t('explorer.copySuccess') : t('actions.copy')}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-dark-200 rounded">
                  <p className="text-xs text-gray-400">{t('balance.total')}</p>
                  <p className="font-semibold">{formatAmount(result.balance?.balance ?? 0)} B1T</p>
                </div>
                <div className="p-4 bg-dark-200 rounded">
                  <p className="text-xs text-gray-400">{t('explorer.received')}</p>
                  <p className="font-semibold">{formatAmount(result.balance?.received ?? 0)} B1T</p>
                </div>
                <div className="p-4 bg-dark-200 rounded">
                  <p className="text-xs text-gray-400">{t('explorer.txCount')}</p>
                  <p className="font-semibold">{result.count}</p>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">{t('tx.latest')}</h3>
                {(result.transactions || []).slice(0, 20).map((tx, idx) => {
                  const direction = (tx.sent && tx.sent > 0) ? 'sent' : 'received';
                  const amount = tx.sent && tx.sent > 0 ? tx.sent : (tx.received || 0);
                  const voutAddrs = (tx.vout || [])
                    .map((o) => o?.scriptPubKey?.addresses?.[0] || o?.addr)
                    .filter(Boolean);
                  const destAddrs = direction === 'sent'
                    ? voutAddrs.filter((a) => a !== result.address)
                    : voutAddrs.filter((a) => a === result.address);
                  const dest = destAddrs[0] || voutAddrs[0] || null;
                  const when = tx.timestamp || tx.time || tx.blocktime;
                  const confs = tx.confirmations ?? null;
                  return (
                    <div key={tx.txid || idx} className="p-3 bg-dark-200 rounded space-y-1">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          {direction === 'sent' ? (
                            <ArrowUpRight size={16} className="text-red-400" />
                          ) : (
                            <ArrowDownLeft size={16} className="text-green-400" />
                          )}
                          <button className="font-mono text-xs hover:underline" onClick={() => openSearch(tx.txid)}>
                            {tx.txid}
                          </button>
                        </div>
                        <div className="text-xs text-gray-300">
                          {direction === 'sent' ? t('explorer.sent') : t('explorer.received')}: {formatAmount(amount)} B1T
                        </div>
                        <span className="text-xs text-gray-400">
                          {formatDate(when)}{confs !== null ? ` · ${confs} ${t('tx.confirmations')}` : ''}
                        </span>
                      </div>
                      {dest && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-400">{t('explorer.to')}:</span>
                          <button className="font-mono hover:underline" onClick={() => openSearch(dest)}>{shortAddr(dest)}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!result.transactions || result.transactions.length === 0) && (
                  <p className="text-sm text-gray-400">{t('tx.none')}</p>
                )}
                <div className="pt-3">
                  <button className="btn-secondary text-xs" onClick={() => setRawOpen(!rawOpen)}>
                    {t('explorer.rawTitle')}
                  </button>
                  {rawOpen && (
                    <pre className="bg-dark-200 p-4 rounded overflow-x-auto text-xs mt-2">{JSON.stringify(result, null, 2)}</pre>
                  )}
                </div>
              </div>
            </div>
          )}

          {result.type === 'tx' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Hash size={20} className="text-b1t-orange" />
                <span className="font-mono text-xs">{result.txid}</span>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => copyToClipboard(result.txid)}>
                  <Copy size={14} /> {copied ? t('explorer.copySuccess') : t('actions.copy')}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-dark-200 rounded">
                  <p className="text-xs text-gray-400">{t('explorer.block')}</p>
                  <div className="font-mono text-xs flex gap-2 items-center">
                    {result.tx?.blockhash ? (
                      <button className="hover:underline" onClick={() => openSearch(result.tx.blockhash)}>{shortAddr(result.tx.blockhash)}</button>
                    ) : 'N/A'}
                  </div>
                </div>
                <div className="p-4 bg-dark-200 rounded">
                  <p className="text-xs text-gray-400">{t('explorer.time')}</p>
                  <p className="font-semibold">{formatDate(result.tx?.time || result.tx?.blocktime)}</p>
                </div>
                <div className="p-4 bg-dark-200 rounded">
                  <p className="text-xs text-gray-400">{t('tx.confirmations')}</p>
                  <p className="font-semibold">{result.tx?.confirmations ?? 'N/A'}</p>
                </div>
              </div>

              {/* Inputs */}
              <div className="space-y-2">
                <h3 className="font-semibold">{t('explorer.inputs')}</h3>
                <div className="space-y-2">
                  {(result.tx?.vin || []).map((v, i) => {
                    const info = inputsResolved[i] || {};
                    const isCoinbase = Boolean(v?.coinbase);
                    return (
                      <div key={i} className="p-3 bg-dark-200 rounded flex items-center justify-between gap-4">
                        {isCoinbase ? (
                          <span className="font-mono text-xs">{t('explorer.coinbase')} — {t('explorer.newBlock')}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {info.addr ? (
                              <button className="font-mono text-xs hover:underline" onClick={() => openSearch(info.addr)}>
                                {shortAddr(info.addr)}
                              </button>
                            ) : (
                              <span className="font-mono text-xs text-gray-300">{t('address.active')}: {v.txid ? shortAddr(v.txid) : 'N/A'}</span>
                            )}
                            {typeof info.value === 'number' && (
                              <span className="text-xs">{formatAmount(info.value)} B1T</span>
                            )}
                          </div>
                        )}
                        <button className="text-xs text-gray-400 hover:underline" onClick={() => v?.txid && openSearch(v.txid)}>
                          {v?.txid ? shortAddr(v.txid) : ''}
                        </button>
                      </div>
                    );
                  })}
                  {(result.tx?.vin || []).length === 0 && (
                    <p className="text-sm text-gray-400">—</p>
                  )}
                  {inputsLoading && (
                    <p className="text-xs text-gray-500">Resolving inputs…</p>
                  )}
                </div>
              </div>

              {/* Outputs */}
              <div className="space-y-2">
                <h3 className="font-semibold">{t('explorer.outputs')}</h3>
                <div className="space-y-2">
                  {(result.tx?.vout || []).map((o, i) => {
                    const addr = o?.scriptPubKey?.addresses?.[0] || o?.addr || null;
                    const val = o?.value ?? 0;
                    return (
                      <div key={i} className="p-3 bg-dark-200 rounded flex items-center justify-between gap-4">
                        <button className="font-mono text-xs hover:underline" onClick={() => addr && openSearch(addr)}>
                          {addr ? shortAddr(addr) : 'unknown'}
                        </button>
                        <span className="text-xs">{formatAmount(val)} B1T</span>
                      </div>
                    );
                  })}
                  {(result.tx?.vout || []).length === 0 && (
                    <p className="text-sm text-gray-400">—</p>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button className="btn-secondary text-xs" onClick={() => setRawOpen(!rawOpen)}>
                  {t('explorer.rawTitle')}
                </button>
                {rawOpen && (
                  <pre className="bg-dark-200 p-4 rounded overflow-x-auto text-xs mt-2">{JSON.stringify(result.tx, null, 2)}</pre>
                )}
              </div>
            </div>
          )}

          {result.type === 'block' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Blocks size={20} className="text-b1t-orange" />
                <span className="font-mono text-xs">{result.block?.hash}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-dark-200 rounded">
                  <p className="text-xs text-gray-400">{t('explorer.height')}</p>
                  <p className="font-semibold">{result.block?.height}</p>
                </div>
                <div className="p-4 bg-dark-200 rounded">
                  <p className="text-xs text-gray-400">{t('explorer.time')}</p>
                  <p className="font-semibold">{formatDate(result.block?.time)}</p>
                </div>
                <div className="p-4 bg-dark-200 rounded">
                  <p className="text-xs text-gray-400">Tx</p>
                  <p className="font-semibold">{(result.block?.tx || []).length}</p>
                </div>
                <div className="p-4 bg-dark-200 rounded">
                  <p className="text-xs text-gray-400">{t('tx.confirmations')}</p>
                  <p className="font-semibold">{result.block?.confirmations ?? 'N/A'}</p>
                </div>
              </div>
              {/* Tx list with links */}
              <div className="space-y-2">
                {(result.block?.tx || []).slice(0, 50).map((tx, idx) => (
                  <div key={idx} className="p-3 bg-dark-200 rounded flex items-center justify-between">
                    <button className="font-mono text-xs hover:underline" onClick={() => openSearch(tx.txid || tx)}>
                      {tx.txid || tx}
                    </button>
                    <span className="text-xs text-gray-400">{formatDate((tx.time || tx.blocktime || result.block?.time))}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2">
                <button className="btn-secondary text-xs" onClick={() => setRawOpen(!rawOpen)}>
                  {t('explorer.rawTitle')}
                </button>
                {rawOpen && (
                  <pre className="bg-dark-200 p-4 rounded overflow-x-auto text-xs mt-2">{JSON.stringify(result.block, null, 2)}</pre>
                )}
              </div>
            </div>
          )}

          {!['address','tx','block'].includes(result.type) && (
            <p className="text-gray-400">Not found</p>
          )}
        </div>
      )}
    </div>
  );
}