// Explorer.jsx - COMPLETE MULTILANGUAGE FIX

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Blocks, Hash, Wallet, Copy, ArrowUpRight, ArrowDownLeft,
  Image, X, ChevronLeft, ChevronRight, Loader, Zap, FileText, Globe,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { explorerApi, ordinalsExplorerApi } from '../services/api';
import { useLocation, useNavigate } from 'react-router-dom';

const short = (s, n = 8) => (s ? `${String(s).slice(0, n)}...${String(s).slice(-n)}` : '—');
const fmtDate = (ts, lang) => ts ? new Date(ts * 1000).toLocaleString(lang || 'en') : 'N/A';
const fmtBit = (v) => (typeof v === 'number' ? v.toFixed(8) : '0.00000000');

function TokenVisualizer({ data }) {
  const tick = data.tick || '????';
  const op = data.op || 'info';
  const hue = (tick.split('').reduce((acc, char) => acc + char.charCodeAt(0), 00) * 137) % 360;
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
      <div className="aspect-square bg-dark-300 flex items-center justify-center overflow-hidden relative">
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
              {new Date(ts).toLocaleDateString()
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function InscriptionModal({ insc, onClose }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const id = insc.id || insc.inscription_id || '';
  const num = insc.number ?? insc.num ?? '?';
  const contentType = insc.content_type || insc.media_type || 'data';
  const contentUrl = ordinalsExplorerApi.getInscriptionContentUrl(id);

  const meta = insc.meta || {};
  const height = insc.genesis_height || insc.height || insc.block_height;
  const ts = insc.timestamp;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 overflow-y-auto z-10" onClick={onClose}>
      <div className="relative max-w-3xl mx-auto bg-dark-100 rounded-2xl border border-b1t-orange/50 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <X size={20} />
        </button>

        <div className="p-6 space-y-4">
          <h3 className="text-2xl font-bold glow-text">{t('explorer.inscriptionDetails')}</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">ID:</span>
              <span className="font-mono text-sm">{id}</span>
            </div>
            <div>
              <span className="text-gray-400">{t('explorer.number')}:</span>
              <span className="font-mono text-sm">#{num}</span>
            </div>
            <div>
              <span className="text-gray-400">{t('explorer.contentType')}:</span>
              <span className="text-sm">{contentType}</span>
            </div>
            <div>
              <span className="text-gray-400">{t('explorer.blockHeight')}:</span>
              <span className="font-mono text-sm">{height || '?'}</span>
            </div>
            <div>
              <span className="text-gray-400">{t('explorer.timestamp')}:</span>
              <span className="text-sm">{fmtDate(ts)}</span>
            </div>
          </div>

          {meta && Object.keys(meta).length > 0 && (
            <div className="mt-4 p-4 bg-dark-200 rounded max-h-32">
              <h4 className="text-sm font-semibold mb-2">{t('explorer.metadata')}</h4>
              <div className="space-y-2 text-xs font-mono bg-dark-300 p-2 rounded max-h-32 overflow-y-auto">
                {Object.entries(meta).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-gray-400">{key}:</span>
                    <span className="font-mono text-sm truncate">{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockchainDashboard({ onOpenSearch }) {
  const { t } = useTranslation();
  const [data, setData] = useState({ blocks: [], transactions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    explorerApi.getLatestData()
      .then(({ blocks, transactions }) => {
        setData({ blocks, transactions });
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load blockchain data:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Blocks size={18} className="text-b1t-orange" />
          {t('explorer.latestBlocks')}
        </h3>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader size={24} className="animate-spin text-b1t-orange" />
        </div>
      ) : (
        <div className="space-y-3">
          {data.blocks.slice(0, 10).map((block, i) => (
            <div key={i} className="p-3 bg-dark-200 rounded-lg border border-dark-300 hover:border-b1t-orange/50 transition">
              <div className="flex items-center gap-2 mb-2">
                <Hash size={14} className="text-b1t-orange" />
                <span className="font-mono text-sm">{short(block.hash, 12)}</span>
              </div>
              <div className="text-xs text-gray-400">
                {t('explorer.block')} #{block.height} · {new Date(block.timestamp * 1000).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Explorer;
