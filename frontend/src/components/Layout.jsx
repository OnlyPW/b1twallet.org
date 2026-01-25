import { Outlet, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet, Home, Send, Download, Menu, X, AlertTriangle, Pickaxe } from 'lucide-react';
import { useState, useEffect } from 'react';
import useWalletStore from '../store/walletStore';
import { useTranslation } from 'react-i18next';

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBeta, setShowBeta] = useState(false);
  const location = useLocation();
  const { isUnlocked, lockWallet } = useWalletStore();
  const { t, i18n } = useTranslation();

  const navigation = [
    { name: t('nav.home'), href: '/', icon: Home, requiresAuth: false },
    { name: t('nav.dashboard'), href: '/dashboard', icon: Wallet, requiresAuth: true },
    { name: t('nav.send'), href: '/send', icon: Send, requiresAuth: true },
    { name: t('nav.receive'), href: '/receive', icon: Download, requiresAuth: true },
    { name: 'Rabb1ts Miner', href: '/mine', icon: Pickaxe, requiresAuth: true },
    // Added Addresses tab
    { name: t('nav.addresses'), href: '/addresses', icon: Wallet, requiresAuth: true },
    { name: t('nav.explorer'), href: '/explorer', icon: Wallet, requiresAuth: false },
    { name: t('nav.mempool'), href: '/mempool', icon: Wallet, requiresAuth: false },
  ];

  const filteredNav = navigation.filter(item => !item.requiresAuth || isUnlocked);

  useEffect(() => {
    try {
      const hidden = localStorage.getItem('hideBetaNotice');
      setShowBeta(hidden !== 'true');
    } catch {
      setShowBeta(true);
    }
  }, []);

  const dismissBeta = () => {
    try { localStorage.setItem('hideBetaNotice', 'true'); } catch { }
    setShowBeta(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-600 via-dark-500 to-dark-400">
      {/* Header */}
      <header className="border-b border-dark-200 backdrop-blur-sm bg-dark-600/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-3 group">
              <motion.img
                src="/B1T-logo.png"
                alt="B1T Logo"
                className="h-10 w-10 logo-glow"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 300 }}
              />
              <span className="text-2xl font-bold glow-text hidden sm:block">
                B1T Wallet
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex space-x-1">
              {filteredNav.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-all ${isActive
                        ? 'bg-gradient-orange text-white shadow-lg'
                        : 'text-gray-300 hover:text-white hover:bg-dark-300'
                      }`}
                  >
                    <Icon size={18} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Lock/Unlock Button */}
            <div className="hidden md:block">
              {isUnlocked && (
                <button
                  onClick={lockWallet}
                  className="btn-secondary text-sm"
                >
                  {t('actions.lockWallet')}
                </button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex items-center gap-2">
              <select
                value={i18n.language}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                className="p-2 rounded-lg bg-dark-300 text-white border border-dark-200 text-sm"
              >
                <option value="en">EN</option>
                <option value="de">DE</option>
                <option value="fr">FR</option>
                <option value="ru">RU</option>
                <option value="zh">ZH</option>
                <option value="vi">VI</option>
                <option value="id">ID</option>
              </select>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg bg-dark-300 text-white"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-dark-200 bg-dark-500"
          >
            <div className="px-4 py-4 space-y-2">
              {filteredNav.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-4 py-3 rounded-lg flex items-center space-x-3 ${isActive
                        ? 'bg-gradient-orange text-white'
                        : 'text-gray-300 hover:bg-dark-300'
                      }`}
                  >
                    <Icon size={20} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
              {isUnlocked && (
                <button
                  onClick={() => {
                    lockWallet();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full btn-secondary text-sm"
                >
                  {t('actions.lockWallet')}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </header>

      {/* Beta Notice Banner */}
      {showBeta && (
        <div className="border-y border-yellow-500/50 bg-yellow-500/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-yellow-500 flex-shrink-0 mt-0.5" size={18} />
              <div className="text-sm">
                <p className="font-semibold">{t('beta.title')}</p>
                <p className="text-gray-300">{t('beta.message')}</p>
              </div>
            </div>
            <button onClick={dismissBeta} className="text-xs text-yellow-500 hover:text-yellow-400">
              {t('actions.dismiss')}
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-200 mt-20 py-8 bg-dark-600/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="text-gray-400 text-sm">
              {t('footer.copy')}
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-400">
              <a href="#" className="hover:text-b1t-orange transition">{t('footer.docs')}</a>
              <span>•</span>
              <a href="#" className="hover:text-b1t-orange transition">{t('footer.github')}</a>
              <span>•</span>
              <a href="#" className="hover:text-b1t-orange transition">{t('footer.discord')}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
