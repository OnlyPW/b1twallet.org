import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Blocks, Hash, Wallet, Copy, ArrowUpRight, ArrowDownLeft,
  Image, X, ChevronLeft, ChevronRight, Loader, Zap, FileText, Globe,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { explorerApi, ordinalsExplorerApi } from '../services/api';
import { useLocation, useNavigate } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const short = (s, n = 8) => (s ? `${String(s).slice(0, n)}...${String(s).slice(-n)}` : '—');
const fmtDate = (ts, lang) => ts ? new Date(ts * 1000).toLocaleString(lang || 'en') : 'N/A';
const fmtBit = (v) => (typeof v === 'number' ? v.toFixed(8) : '0.00000000');

/**
 * Renders a stylized card for BRC-20 / B1T-20 tokens
 */
function TokenVisualizer({ data }) {
  const tick = data.tick || '????';
  const op = data.op || 'info';

  const hue = (tick.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) * 137) % 360;
  const gradient = `linear-gradient(135deg, hsl(${hue}, 70%, 25%), hsl(${hue + 40}, 80%, 15%))`;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 relative text-white" style={{ background: gradient }}>
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
      <div className="bg-white/10 backdrop-blur-md rounded-lg p-2.5 w-full border border-white/20 flex flex-col items-center shadow-lg">
        <span className="text-[9px] uppercase font-bold tracking-widest text-white/50 mb-1">{data.p}</span>
        <span className="text-xl font-black tracking-tighter mb-1 drop-shadow-md">{tick}</span>
        <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${op === 'mint' ? 'bg-green-500/30 text-green-300' : 'bg-blue-500/30 text-blue-300'} border border-white/10`}>
          {op}
        </div>
      </div>
      {data.amt && (
        <div className="mt-2 text-[9px] font-mono text-white/70 bg-black/30 px-2 py-0.5 rounded">
          {data.amt}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// InscriptionCard
// ─────────────────────────────────────────────────────────────────────────────
function InscriptionCard({ insc, onClick }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [tokenData, setTokenData] = useState(null);

  const id = insc.id || insc.inscription_id || '';
  const num = insc.number ?? insc.num ?? '?';
  const contentType = (insc.content_type || insc.media_type || '').toLowerCase();

  const isText = contentType.includes('text/plain') || contentType.includes('application/json');
  const canTryImage = !isText && !contentType.includes('application/pdf');

  useEffect(() => {
    if (isText && id) {
      fetch(ordinalsExplorerApi.getInscriptionContentUrl(id))
        .then(r => r.text())
        .then(txt => {
          try {
            const data = JSON.parse(txt.trim());
            if (data.p && data.tick) setTokenData(data);
          } catch (e) {
            if (txt.includes('"p":') && txt.includes('"tick":')) {
              const p = txt.match(/"p":\s*"([^"]+)"/)?.[1];
              const tick = txt.match(/"tick":\s*"([^"]+)"/)?.[1];
              const op = txt.match(/"op":\s*"([^"]+)"/)?.[1];
              const amt = txt.match(/"amt":\s*"([^"]+)"/)?.[1];
              if (p && tick) setTokenData({ p, tick, op, amt });
            }
          }
        })
        .catch(() => { });
    }
  }, [id, isText]);

  const contentUrl = ordinalsExplorerApi.getInscriptionContentUrl(id);
  const height = insc.genesis_height || insc.height || insc.block_height;
  const ts = insc.timestamp;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.03, y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="card bg-dark-200 cursor-pointer hover:border-b1t-orange/60 transition group overflow-hidden p-0 border border-white/5"
      onClick={() => onClick(insc)}
    >
      {/* Preview */}
      <div className="aspect-square bg-dark-300 flex items-center justify-center overflow-hidden relative">
        {/* Placeholder / Token View */}
        {!tokenData ? (
          <div className="flex flex-col items-center gap-2 text-gray-500 p-4">
            <FileText size={32} className="opacity-40" />
            <span className="text-[10px] font-mono break-all text-center leading-tight">
              {contentType.split(';')[0] || 'data'}
            </span>
          </div>
        ) : (
          <TokenVisualizer data={tokenData} />
        )}

        {canTryImage && !imgError && (
          <img
            src={contentUrl}
            alt={`Inscription #${num}`}
            className="w-full h-full object-contain absolute inset-0 z-10"
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        )}

        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-gray-400 font-mono backdrop-blur-sm z-20">
          #{num}
        </div>
      </div>
      {/* Footer */}
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Blocks size={12} className="text-gray-500" />
            <span className="text-[11px] font-medium text-gray-300">
              {height && height !== '?' ? `Block ${height}` : 'Pending'}
            </span>
          </div>
          <span className="text-[10px] text-gray-400 bg-dark-400 px-1.5 py-0.5 rounded uppercase font-mono">
            {tokenData ? tokenData.p : (contentType.split('/')[1]?.split(';')[0] || contentType.split(';')[0] || 'data')}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] text-gray-500 truncate">{short(id, 6)}</p>
          {ts && ts !== '1970-01-01T00:00:00Z' && (
            <span className="text-[10px] text-gray-600 whitespace-nowrap">
              {new Date(ts).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InscriptionModal
// ─────────────────────────────────────────────────────────────────────────────
function InscriptionModal({ insc, onClose }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const id = insc?.id || insc?.inscription_id || '';
  const contentType = (detail?.content_type || insc?.content_type || insc?.media_type || '').toLowerCase();

  // High sensitivity image check
  const isImage = contentType.startsWith('image/') ||
    contentType.includes('svg') ||
    contentType.includes('webp') ||
    contentType.includes('octet-stream'); // Try octet-stream as image first

  const contentUrl = ordinalsExplorerApi.getInscriptionContentUrl(id);

  useEffect(() => {
    if (!id) return;
    setDetailLoading(true);
    setImgError(false);
    ordinalsExplorerApi.getInscription(id)
      .then(r => setDetail(r.data || r))
      .catch(() => { })
      .finally(() => setDetailLoading(false));
  }, [id]);

  const copy = async (text) => {
    await navigator.clipboard.writeText(String(text));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const d = detail || insc;
  const fields = [
    { label: 'ID', value: id },
    { label: 'Number', value: d?.number ?? d?.num },
    { label: 'Content Type', value: d?.content_type || d?.media_type },
    { label: 'Content Length', value: d?.content_length ? `${d.content_length} bytes` : undefined },
    { label: 'Block Height', value: d?.genesis_height || d?.height },
    { label: 'TXID', value: d?.genesis_transaction || d?.genesis_tx || d?.txid },
    { label: 'Owner', value: d?.address || d?.owner },
    { label: 'Timestamp', value: d?.timestamp ? (isNaN(d.timestamp) ? new Date(d.timestamp).toLocaleString() : new Date(Number(d.timestamp) * 1000).toLocaleString()) : undefined },

  ].filter(f => f.value !== undefined && f.value !== null && f.value !== '');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.88, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="card bg-dark-400 max-w-lg w-full max-h-[95vh] overflow-y-auto border border-white/10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 p-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Zap size={18} className="text-b1t-orange" />
            Inscription {d?.number !== undefined ? `#${d.number}` : ''}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-200 transition text-gray-400">
            <X size={20} />
          </button>
        </div>

        {/* Content Render */}
        <div className="bg-dark-300 rounded-xl overflow-hidden mb-6 border border-white/5 relative flex items-center justify-center" style={{ minHeight: 300 }}>
          {detailLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-300/50 backdrop-blur-sm z-10">
              <Loader size={32} className="animate-spin text-b1t-orange" />
            </div>
          )}

          {isImage && !imgError ? (
            <img
              src={contentUrl}
              alt="Preview"
              className="max-w-full max-h-[60vh] object-contain block mx-auto shadow-inner"
              style={{ imageRendering: 'pixelated' }}
              onLoad={() => setDetailLoading(false)}
              onError={() => setImgError(true)}
              decoding="async"
            />
          ) : (
            <iframe
              src={contentUrl}
              title={`Inscription ${id}`}
              className="w-full aspect-square border-0"
              style={{
                background: '#0d1117',
                imageRendering: 'pixelated',
                display: 'block'
              }}
              sandbox="allow-scripts"
              loading="lazy"
              onLoad={() => setDetailLoading(false)}
            />
          )}

          <div className="absolute bottom-3 right-3 flex gap-2">
            <a
              href={contentUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 bg-black/70 backdrop-blur-md rounded-full border border-white/10 hover:border-b1t-orange/50"
            >
              <ArrowUpRight size={14} /> Live Content
            </a>
          </div>
        </div>



        {/* Metadata */}
        <div className="space-y-2 text-sm">
          {fields.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-start gap-4 py-1.5 border-b border-dark-300">
              <span className="text-gray-400 shrink-0">{label}</span>
              <div className="flex items-center gap-2 text-right">
                <span className="font-mono text-xs text-white break-all">{String(value)}</span>
                {(label === 'ID' || label === 'TXID') && (
                  <button onClick={() => copy(value)} className="text-gray-500 hover:text-b1t-orange shrink-0">
                    <Copy size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {copied && <p className="text-xs text-green-400 text-right">✓ Copied!</p>}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Ordinals Explorer
// ─────────────────────────────────────────────────────────────────────────────
function OrdinalsTab() {
  const [inscriptions, setInscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState(null); // { ok, blockCount }
  const [selected, setSelected] = useState(null);
  const [searchId, setSearchId] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const s = await ordinalsExplorerApi.getStatus();
      setStatus(s);
    } catch {
      setStatus({ ok: false });
    }
  }, []);

  const loadInscriptions = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await ordinalsExplorerApi.getLatestInscriptions(p);
      const data = res?.data;
      // ord-indexer returns { inscriptions: [...] } or an array
      const list = Array.isArray(data) ? data
        : Array.isArray(data?.inscriptions) ? data.inscriptions
          : [];
      setInscriptions(list);
    } catch {
      setInscriptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    loadInscriptions(0);
  }, []);

  const goPage = (delta) => {
    const next = Math.max(0, page + delta);
    setPage(next);
    loadInscriptions(next);
  };

  const doSearch = async (e) => {
    e?.preventDefault();
    const q = searchId.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const res = await ordinalsExplorerApi.getInscription(q);
      setSearchResult(res?.data || res);
    } catch (err) {
      setSearchError('Inscription not found: ' + err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {status && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm ${status.ok ? 'bg-green-900/20 border border-green-500/20 text-green-300' : 'bg-yellow-900/20 border border-yellow-500/20 text-yellow-300'}`}>
          <div className={`w-2 h-2 rounded-full ${status.ok ? 'bg-green-400' : 'bg-yellow-400'} animate-pulse`} />
          {status.ok
            ? `Ord-Indexer online · Block ${status.blockCount}`
            : 'Ord-Indexer offline or still starting up…'}
        </div>
      )}

      {/* Search */}
      <form onSubmit={doSearch} className="flex gap-2">
        <input
          className="input"
          placeholder="Inscription ID suchen… (z.B. abc123…i0)"
          value={searchId}
          onChange={e => setSearchId(e.target.value)}
        />
        <button type="submit" className="btn-primary flex items-center gap-2" disabled={searchLoading}>
          {searchLoading ? <Loader size={16} className="animate-spin" /> : <Search size={16} />}
          Suchen
        </button>
      </form>

      {/* Search result */}
      <AnimatePresence>
        {searchError && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="card text-red-300 border-red-400/30 text-sm">
            {searchError}
          </motion.div>
        )}
        {searchResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-xs text-gray-400 mb-2">Suchergebnis:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <InscriptionCard insc={searchResult} onClick={setSelected} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gallery */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Image size={18} className="text-b1t-orange" />
            Neueste Inscriptions
          </h2>
          <div className="flex gap-2">
            <button onClick={() => goPage(-1)} disabled={page === 0 || loading}
              className="btn-secondary p-2" title="Previous">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-400 flex items-center px-2">Seite {page + 1}</span>
            <button onClick={() => goPage(1)} disabled={loading}
              className="btn-secondary p-2" title="Next">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-dark-300 rounded-full" />
              <div className="absolute inset-0 w-16 h-16 border-4 border-b1t-orange border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : inscriptions.length === 0 ? (
          <div className="text-center py-16 text-gray-400 space-y-3">
            <Image size={48} className="mx-auto opacity-25" />
            <p className="text-sm">
              {status?.ok
                ? 'Noch keine Inscriptions indexiert. Der Indexer läuft – warte auf den ersten Block.'
                : 'Ord-Indexer nicht erreichbar. Starte mit docker-compose up --build.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {inscriptions.map((insc, i) => (
              <InscriptionCard
                key={insc.id || insc.inscription_id || i}
                insc={insc}
                onClick={setSelected}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selected && <InscriptionModal insc={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}

/**
 * Dashboard for the Blockchain tab, showing latest blocks and transactions
 */
export function BlockchainDashboard({ onOpenSearch }) {
  const { t } = useTranslation();
  const [data, setData] = useState({ blocks: [], transactions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    explorerApi.getLatestData()
      .then(res => setData(res))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader size={32} className="animate-spin text-b1t-orange opacity-50" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Latest Blocks */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
          <Blocks size={14} /> Neueste Blöcke
        </h3>
        <div className="space-y-2">
          {data.blocks.map((b) => (
            <div key={b.hash} className="p-3 bg-dark-200/50 hover:bg-dark-200 border border-white/5 rounded-xl transition group flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-b1t-orange/10 flex items-center justify-center text-b1t-orange font-bold text-sm">
                  {b.height}
                </div>
                <div className="flex flex-col">
                  <button onClick={() => onOpenSearch(b.hash)} className="text-[13px] font-mono hover:underline text-gray-200 text-left">
                    {short(b.hash, 8)}
                  </button>
                  <span className="text-[10px] text-gray-500">{Array.isArray(b.tx) ? b.tx.length : 0} Transaktionen</span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <span className="text-[11px] text-gray-400 font-medium">Block</span>
                <span className="text-[10px] text-gray-500 italic">{fmtDate(b.time)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Latest Transactions */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
          <Zap size={14} /> Neueste Transaktionen
        </h3>
        <div className="space-y-2">
          {data.transactions.map((tx) => (
            <div key={tx.txid} className="p-3 bg-dark-200/50 hover:bg-dark-200 border border-white/5 rounded-xl transition group flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <ArrowUpRight size={18} />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <button onClick={() => onOpenSearch(tx.txid)} className="text-[13px] font-mono hover:underline text-gray-200 truncate pr-2 text-left">
                    {short(tx.txid, 8)}
                  </button>
                  <span className="text-[10px] text-gray-500 truncate">
                    {tx.vout?.length || 0} Outputs
                  </span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end shrink-0">
                <span className="text-xs font-bold text-b1t-orange">
                  {fmtBit(tx.vout?.reduce((acc, o) => acc + (o.value || 0), 0))} B1T
                </span>
                <span className="text-[10px] text-gray-500 italic">{fmtDate(tx.blocktime || tx.time)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Blockchain Explorer (original Explorer, preserved)
// ─────────────────────────────────────────────────────────────────────────────
function BlockchainTab() {
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
      navigate(`/explorer?q=${encodeURIComponent(term)}`, { replace: true });
      setResult(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (ts) => fmtDate(ts, i18n.language);
  const formatAmount = fmtBit;
  const shortAddr = (addr) => short(addr);

  const copyToClipboard = async (text) => {
    await navigator.clipboard.writeText(String(text || ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const openSearch = (term) => { setQ(term); };
  useEffect(() => { if (q) onSearch(); }, [q]); // eslint-disable-line

  const resetSearch = () => {
    setQ('');
    setResult(null);
    setError(null);
    navigate('/explorer', { replace: true });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initial = (params.get('q') || '').trim();
    if (initial && initial !== q) {
      setQ(initial);
      (async () => {
        setLoading(true); setError(null); setResult(null);
        try { setResult(await explorerApi.search(initial)); }
        catch (err) { setError(err.message); }
        finally { setLoading(false); }
      })();
    }
  }, [location.search]); // eslint-disable-line

  useEffect(() => {
    const resolveInputs = async () => {
      if (result?.type !== 'tx') return;
      const vins = Array.isArray(result.tx?.vin) ? result.tx.vin : [];
      if (!vins.length) { setInputsResolved([]); return; }
      setInputsLoading(true);
      try {
        const tasks = vins.map(async (v) => {
          if (v?.coinbase) return { coinbase: true };
          if (!v?.txid || typeof v?.vout !== 'number') return { txid: v?.txid || null };
          try {
            const prev = await explorerApi.getTx(v.txid);
            const prevOut = prev?.tx?.vout?.[v.vout];
            return {
              txid: v.txid, vout: v.vout,
              addr: prevOut?.scriptPubKey?.addresses?.[0] || prevOut?.addr || null,
              value: typeof prevOut?.value === 'number' ? prevOut.value : null,
            };
          } catch { return { txid: v.txid, vout: v.vout }; }
        });
        setInputsResolved(await Promise.all(tasks));
      } finally { setInputsLoading(false); }
    };
    resolveInputs();
  }, [result?.type, result?.txid]); // eslint-disable-line

  return (
    <div className="space-y-6">
      <form onSubmit={onSearch} className="flex gap-2">
        <input className="input" placeholder={t('explorer.searchPlaceholder')}
          value={q} onChange={e => setQ(e.target.value)} />
        <button type="submit" className="btn-primary flex items-center gap-2" disabled={loading}>
          <Search size={18} /> {loading ? '...' : t('actions.refresh')}
        </button>
      </form>

      {error && <div className="card text-red-300 border-red-400/30">{error}</div>}

      {(result || error) && (
        <button onClick={resetSearch} className="btn-secondary flex items-center gap-2 mb-4">
          <ChevronLeft size={16} /> Zurück zur Übersicht
        </button>
      )}

      {!result && !loading && !error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <BlockchainDashboard onOpenSearch={openSearch} />
        </motion.div>
      )}

      {result && (
        <div className="card space-y-6">
          {/* Address */}
          {result.type === 'address' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Wallet size={20} className="text-b1t-orange" />
                <span className="font-mono text-sm">{result.address}</span>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => copyToClipboard(result.address)}>
                  <Copy size={14} /> {copied ? '✓' : t('actions.copy')}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  [t('balance.total'), `${formatAmount(result.balance?.balance ?? 0)} B1T`],
                  [t('explorer.received'), `${formatAmount(result.balance?.received ?? 0)} B1T`],
                  [t('explorer.txCount'), result.count],
                ].map(([label, val]) => (
                  <div key={label} className="p-4 bg-dark-200 rounded">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="font-semibold">{val}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">{t('tx.latest')}</h3>
                {(result.transactions || []).slice(0, 20).map((tx, idx) => {
                  const dir = tx.sent > 0 ? 'sent' : 'received';
                  const amt = tx.sent > 0 ? tx.sent : (tx.received || 0);
                  const when = tx.timestamp || tx.time || tx.blocktime;
                  return (
                    <div key={tx.txid || idx} className="p-3 bg-dark-200 rounded space-y-1">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          {dir === 'sent' ? <ArrowUpRight size={16} className="text-red-400" /> : <ArrowDownLeft size={16} className="text-green-400" />}
                          <button className="font-mono text-xs hover:underline" onClick={() => openSearch(tx.txid)}>{tx.txid}</button>
                        </div>
                        <span className="text-xs">{dir === 'sent' ? '−' : '+'}{formatAmount(amt)} B1T</span>
                        <span className="text-xs text-gray-400">{formatDate(when)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Transaction */}
          {result.type === 'tx' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Hash size={20} className="text-b1t-orange" />
                <span className="font-mono text-xs">{result.txid}</span>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => copyToClipboard(result.txid)}>
                  <Copy size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  [t('explorer.block'), result.tx?.blockhash ? <button className="hover:underline font-mono text-xs" onClick={() => openSearch(result.tx.blockhash)}>{shortAddr(result.tx.blockhash)}</button> : 'N/A'],
                  [t('explorer.time'), formatDate(result.tx?.time || result.tx?.blocktime)],
                  [t('tx.confirmations'), result.tx?.confirmations ?? 'N/A'],
                ].map(([label, val]) => (
                  <div key={String(label)} className="p-4 bg-dark-200 rounded">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="font-semibold">{val}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">{t('explorer.inputs')}</h3>
                {(result.tx?.vin || []).map((v, i) => {
                  const info = inputsResolved[i] || {};
                  return (
                    <div key={i} className="p-3 bg-dark-200 rounded flex items-center justify-between gap-4">
                      {v?.coinbase
                        ? <span className="font-mono text-xs">Coinbase</span>
                        : <div className="flex items-center gap-2">
                          {info.addr && <button className="font-mono text-xs hover:underline" onClick={() => openSearch(info.addr)}>{shortAddr(info.addr)}</button>}
                          {typeof info.value === 'number' && <span className="text-xs">{formatAmount(info.value)} B1T</span>}
                        </div>
                      }
                      {v?.txid && <button className="text-xs text-gray-400 hover:underline" onClick={() => openSearch(v.txid)}>{shortAddr(v.txid)}</button>}
                    </div>
                  );
                })}
                {inputsLoading && <p className="text-xs text-gray-500">Resolving inputs…</p>}
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">{t('explorer.outputs')}</h3>
                {(result.tx?.vout || []).map((o, i) => {
                  const addr = o?.scriptPubKey?.addresses?.[0] || o?.addr || null;
                  return (
                    <div key={i} className="p-3 bg-dark-200 rounded flex items-center justify-between gap-4">
                      <button className="font-mono text-xs hover:underline" onClick={() => addr && openSearch(addr)}>{addr ? shortAddr(addr) : 'unknown'}</button>
                      <span className="text-xs">{formatAmount(o?.value ?? 0)} B1T</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Block */}
          {result.type === 'block' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Blocks size={20} className="text-b1t-orange" />
                <span className="font-mono text-xs">{result.block?.hash}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  [t('explorer.height'), result.block?.height],
                  [t('explorer.time'), formatDate(result.block?.time)],
                  ['Tx', (result.block?.tx || []).length],
                  [t('tx.confirmations'), result.block?.confirmations ?? 'N/A'],
                ].map(([label, val]) => (
                  <div key={String(label)} className="p-4 bg-dark-200 rounded">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="font-semibold">{val}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {(result.block?.tx || []).slice(0, 50).map((tx, idx) => (
                  <div key={idx} className="p-3 bg-dark-200 rounded flex items-center justify-between">
                    <button className="font-mono text-xs hover:underline" onClick={() => openSearch(tx.txid || tx)}>{tx.txid || tx}</button>
                    <span className="text-xs text-gray-400">{formatDate(tx.time || tx.blocktime || result.block?.time)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <button className="btn-secondary text-xs" onClick={() => setRawOpen(!rawOpen)}>{t('explorer.rawTitle')}</button>
            {rawOpen && <pre className="bg-dark-200 p-4 rounded overflow-x-auto text-xs mt-2">{JSON.stringify(result, null, 2)}</pre>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Explorer Page (tabbed)
// ─────────────────────────────────────────────────────────────────────────────
export default function Explorer() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('ordinals');

  const tabs = [
    { id: 'ordinals', label: '🖼 Ordinals Explorer', icon: <Image size={16} /> },
    { id: 'blockchain', label: '⛓ Blockchain', icon: <Globe size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
        <h1 className="text-4xl font-bold glow-text">{t('nav.explorer')}</h1>
        <p className="text-gray-400">B1T Ordinals & Blockchain Explorer</p>
      </motion.div>

      {/* Tab switcher */}
      <div className="flex gap-2 p-1 bg-dark-300 rounded-xl w-fit mx-auto">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === id
              ? 'bg-b1t-orange text-black shadow-lg shadow-b1t-orange/20'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: tab === 'ordinals' ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: tab === 'ordinals' ? 20 : -20 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'ordinals' ? <OrdinalsTab /> : <BlockchainTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}