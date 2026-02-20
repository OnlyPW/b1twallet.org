import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { walletApi } from '../services/api';
import { useTranslation } from 'react-i18next';
import useWalletStore from '../store/walletStore';
import { AlertCircle, AlertTriangle, PenTool } from 'lucide-react';

export default function Tokens() {
  const { t } = useTranslation();
  const { addresses } = useWalletStore();
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (addresses.length > 0) {
      loadTokenData();
    }
  }, [addresses]);

  const loadTokenData = async () => {
    setLoading(true);
    setError(null);
    try {
      const allTokens = [];
      for (const address of addresses) {
        const response = await walletApi.getTokens(address.address);
        if (response.success && response.tokens?.length > 0) {
          allTokens.push(...response.tokens);
        }
      }
      setTokens(allTokens);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('indexer') || msg.includes('not available') || msg.includes('500')) {
        setError('indexer');
      } else {
        setError('generic');
      }
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[20vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-b1t-orange"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">{t('tokens.title')}</h3>

      <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30 flex items-start gap-3">
        <AlertTriangle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-yellow-400">{t('tokens.alphaTitle')}</p>
          <p className="text-gray-400 mt-1">{t('tokens.alphaDesc')}</p>
        </div>
      </div>

      {error === 'indexer' && (
        <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30 flex items-start gap-3">
          <AlertCircle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-yellow-400">{t('tokens.indexerUnavailable')}</p>
            <p className="text-gray-400 mt-1">{t('tokens.indexerUnavailableDesc')}</p>
          </div>
        </div>
      )}

      {error === 'generic' && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-400">
          {t('tokens.loadError')}
        </div>
      )}

      {!error && tokens.length === 0 ? (
        <div className="text-center py-12 text-gray-400 space-y-4">
          <p>{t('tokens.none')}</p>
          <Link
            to="/inscribe"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-orange text-white hover:opacity-90 transition"
          >
            <PenTool size={16} />
            {t('tokens.inscribeNow')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tokens.map((token, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="card bg-dark-200"
            >
              <div className="flex flex-col h-full">
                <div className="flex-grow">
                  <p className="font-bold text-lg">{token.ticker}</p>
                  <p className="text-sm text-gray-400">{token.balance}</p>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  <p><strong>{t('tokens.id')}:</strong> {token.id}</p>
                  <p><strong>{t('tokens.standard')}:</strong> {token.standard}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
