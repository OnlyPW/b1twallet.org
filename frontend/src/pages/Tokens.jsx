import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { walletApi } from '../services/api';
import { useTranslation } from 'react-i18next';
import useWalletStore from '../store/walletStore';

export default function Tokens() {
  const { t } = useTranslation();
  const { addresses } = useWalletStore();
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (addresses.length > 0) {
      loadTokenData();
    }
  }, [addresses]);

  const loadTokenData = async () => {
    setLoading(true);
    try {
      const allTokens = [];
      for (const address of addresses) {
        const response = await walletApi.getTokens(address.address);
        if (response.success && response.tokens.length > 0) {
          allTokens.push(...response.tokens);
        }
      }
      setTokens(allTokens);
    } catch (error) {
      console.error('Failed to load tokens:', error);
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
      {tokens.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>{t('tokens.none')}</p>
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
