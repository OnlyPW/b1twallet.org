import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Blocks, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function BlockHeightWidget() {
  const { t } = useTranslation();
  const [blockHeight, setBlockHeight] = useState(null);
  const [previousHeight, setPreviousHeight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewBlockPopup, setShowNewBlockPopup] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);

  const fetchBlockHeight = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/blockchain/status`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      
      if (data.success) {
        setPreviousHeight(blockHeight);
        setBlockHeight(data.blocks);
        setLoading(false);
        setError(null);
        setLastUpdateTime(new Date());
        
        if (blockHeight !== null && data.blocks > blockHeight) {
          setShowNewBlockPopup(true);
          setTimeout(() => setShowNewBlockPopup(false), 5000);
        }
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [blockHeight]);

  useEffect(() => {
    fetchBlockHeight();
    const interval = setInterval(fetchBlockHeight, 10000);
    return () => clearInterval(interval);
  }, [fetchBlockHeight]);

  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-dark-800/95 backdrop-blur-sm border border-dark-600 rounded-lg shadow-lg p-3 min-w-[180px]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Blocks size={16} className="text-b1t-orange" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">{t('blockHeight.title')}</span>
            {loading && <RefreshCw size={12} className="animate-spin text-gray-500" />}
          </div>
          
          <div className="flex items-baseline gap-2">
            {error ? (
              <div className="flex items-center gap-1 text-red-400">
                <AlertCircle size={14} />
                <span className="text-xs">{t('blockHeight.error')}</span>
              </div>
            ) : (
              <>
                <span className="text-xl font-bold text-white font-mono">
                  {blockHeight?.toLocaleString() || '...'}
                </span>
                <AnimatePresence>
                  {previousHeight !== null && blockHeight > previousHeight && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-xs text-green-400"
                    >
                      +{blockHeight - previousHeight}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
          
          {lastUpdateTime && (
            <div className="text-xs text-gray-500 mt-1">
              {t('blockHeight.lastUpdate')}: {formatTime(lastUpdateTime)}
            </div>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {showNewBlockPopup && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 z-50"
          >
            <div className="bg-green-900/95 backdrop-blur-sm border border-green-500/50 rounded-lg shadow-xl px-4 py-3 flex items-center gap-3">
              <div className="bg-green-500/20 p-2 rounded-full">
                <CheckCircle size={20} className="text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-green-300">{t('blockHeight.newBlock')}</p>
                <p className="text-sm text-green-200/70">
                  {t('blockHeight.blockNumber')}: <span className="font-mono font-bold">{blockHeight?.toLocaleString()}</span>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
