import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Image, Plus, Eye, Send, Download, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import useWalletStore from '../store/walletStore';
import { ordinalsApi } from '../services/api';

export default function Ordinals() {
  const { isUnlocked, addresses, getCurrentAddress } = useWalletStore();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [ordinals, setOrdinals] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrdinal, setSelectedOrdinal] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (!isUnlocked) return;
    loadOrdinals();
  }, [isUnlocked, addresses]);

  const loadOrdinals = async () => {
    try {
      setLoading(true);
      const currentAddr = getCurrentAddress();
      if (!currentAddr) return;

      // Load inscriptions for current address
      const response = await ordinalsApi.getInscriptions(currentAddr.address);
      if (response.success) {
        setInscriptions(response.inscriptions || []);
        setOrdinals(response.ordinals || []);
      }
    } catch (error) {
      console.error('Failed to load ordinals:', error);
      toast.error(t('ordinals.toast.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInscription = () => {
    setShowCreateModal(true);
  };

  const handleSendOrdinal = (ordinal) => {
    // Navigate to send page with ordinal pre-selected
    toast.info(t('ordinals.toast.sendPrepared'));
  };

  const filteredOrdinals = ordinals.filter(ordinal =>
    ordinal.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ordinal.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isUnlocked) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <Image className="h-16 w-16 mx-auto mb-4 text-b1t-orange opacity-50" />
          <p className="text-gray-400">{t('ordinals.locked')}</p>
          <Link to="/import" className="btn-primary mt-4">
            {t('nav.import')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4"
      >
        <h1 className="text-4xl font-bold glow-text flex items-center justify-center gap-3">
          <Image className="text-b1t-orange" />
          {t('ordinals.title')}
        </h1>
        <p className="text-gray-400">{t('ordinals.subtitle')}</p>
      </motion.div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Link
          to="/create-inscription"
          className="card hover:border-b1t-orange transition-all group text-left"
        >
          <div className="flex items-center space-x-4">
            <div className="p-4 rounded-full bg-gradient-orange text-white group-hover:scale-110 transition-transform">
              <Plus size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{t('ordinals.create.title')}</h3>
              <p className="text-gray-400 text-sm">{t('ordinals.create.subtitle')}</p>
            </div>
          </div>
        </Link>

        <button
          onClick={() => toast.info(t('ordinals.transfer.comingSoon'))}
          className="card hover:border-b1t-orange transition-all group text-left opacity-75"
        >
          <div className="flex items-center space-x-4">
            <div className="p-4 rounded-full bg-gray-600 text-white group-hover:scale-110 transition-transform">
              <Send size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{t('ordinals.transfer.title')}</h3>
              <p className="text-gray-400 text-sm">{t('ordinals.transfer.subtitle')}</p>
            </div>
          </div>
        </button>

        <a
          href="https://ord.b1texplorer.com"
          target="_blank"
          rel="noopener noreferrer"
          className="card hover:border-b1t-orange transition-all group text-left"
        >
          <div className="flex items-center space-x-4">
            <div className="p-4 rounded-full bg-gradient-orange text-white group-hover:scale-110 transition-transform">
              <Search size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{t('ordinals.explorer.title')}</h3>
              <p className="text-gray-400 text-sm">{t('ordinals.explorer.subtitle')}</p>
            </div>
          </div>
        </a>
      </div>

      {/* Search Bar */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder={t('ordinals.search.placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-dark-200 border border-dark-300 rounded-lg focus:outline-none focus:border-b1t-orange text-white"
          />
        </div>
      </div>

      {/* Ordinals Collection */}
      <div className="card space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-semibold">{t('ordinals.collection.title')}</h3>
          <button
            onClick={loadOrdinals}
            disabled={loading}
            className="text-sm text-b1t-orange hover:text-b1t-orange-400"
          >
            {loading ? t('ordinals.loading') : t('ordinals.refresh')}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-b1t-orange"></div>
          </div>
        ) : ordinals.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Image size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">{t('ordinals.empty.title')}</p>
            <p className="text-sm mt-2">{t('ordinals.empty.subtitle')}</p>
            <Link
              to="/create-inscription"
              className="btn-primary mt-4"
            >
              {t('ordinals.create.first')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOrdinals.map((ordinal, index) => (
              <motion.div
                key={ordinal.id || index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className="card hover:border-b1t-orange transition-all cursor-pointer"
                onClick={() => setSelectedOrdinal(ordinal)}
              >
                <div className="aspect-square bg-dark-200 rounded-lg mb-4 overflow-hidden">
                  {ordinal.contentType?.startsWith('image/') ? (
                    <img
                      src={ordinal.previewUrl || `https://ord.b1texplorer.com/content/${ordinal.id}`}
                      alt={ordinal.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23444"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="white" font-size="10"%3ENo Image%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image size={48} className="text-gray-500" />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-white truncate">
                    {ordinal.name || `Ordinal #${index + 1}`}
                  </h4>
                  <p className="text-xs text-gray-400 truncate">
                    {ordinal.description || t('ordinals.noDescription')}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-b1t-orange font-mono">
                      {ordinal.id}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendOrdinal(ordinal);
                        }}
                        className="p-1 rounded hover:bg-dark-200 transition"
                        title={t('ordinals.actions.send')}
                      >
                        <Send size={16} />
                      </button>
                      <a
                        href={`https://ord.b1texplorer.com/inscription/${ordinal.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 rounded hover:bg-dark-200 transition"
                        title={t('ordinals.actions.view')}
                      >
                        <Eye size={16} />
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal Placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card max-w-lg w-full p-6"
          >
            <h3 className="text-2xl font-bold mb-4">{t('ordinals.create.modalTitle')}</h3>
            <p className="text-gray-400 mb-6">
              {t('ordinals.create.modalDescription')}
            </p>
            <div className="text-center py-8">
              <p className="text-b1t-orange mb-4">🔧 {t('ordinals.create.comingSoon')}</p>
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-secondary"
              >
                {t('actions.dismiss')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}