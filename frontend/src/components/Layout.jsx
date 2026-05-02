import { Outlet, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet, Home, Send, Download, Menu, X, AlertTriangle, Pickaxe, PenTool, Search, Activity, Lock, BookOpen, AtSign } from 'lucide-react';
import { useState, useEffect } from 'react';
import useWalletStore from '../store/walletStore';
import { useTranslation } from 'react-i18next';
import BlockHeightWidget from './BlockHeightWidget';

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
    { name: t('nav.addresses'), href: '/addresses', icon: BookOpen, requiresAuth: true },
    { name: t('nav.receive'), href: '/receive', icon: Download, requiresAuth: true },
    { name: t('nav.inscribe'), href: '/inscribe', icon: PenTool, requiresAuth: true },
    { name: 'Names', href: '/names', icon: AtSign, requiresAuth: false },
    // { name: t('nav.mine'), href: '/mine', icon: Pickaxe, requiresAuth: true }, // TEMPORARILY DISABLED
    { name: t('nav.explorer'), href: '/explorer', icon: Search, requiresAuth: false },
    { name: t('nav.mempool'), href: '/mempool', icon: Activity, requiresAuth: false },
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
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex items-center py-2 gap-2">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
              <motion.img
                src="/B1T-logo.png"
                alt="B1T Logo"
                className="h-8 w-8 logo-glow"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 300 }}
              />
              <span className="text-lg font-bold glow-text hidden xl:block whitespace-nowrap">
                B1T Wallet
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-0.5 flex-1 justify-center min-w-0">
              {filteredNav.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    title={item.name}
                    className={`px-2 xl:px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all text-xs font-medium whitespace-nowrap ${isActive
                        ? 'bg-gradient-orange text-white shadow-md'
                        : 'text-gray-400 hover:text-white hover:bg-dark-300'
                      }`}
                  >
                    <Icon size={15} />
                    <span className="hidden xl:inline">{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right side: language, lock, mobile menu */}
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
              <select
                value={i18n.language}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                className="px-1.5 py-1.5 rounded-lg bg-dark-300 text-white border border-dark-200 text-xs cursor-pointer"
              >
                <option value="en">EN</option>
                <option value="de">DE</option>
                <option value="fr">FR</option>
                <option value="ru">RU</option>
                <option value="zh">ZH</option>
                <option value="vi">VI</option>
                <option value="id">ID</option>
              </select>

              {isUnlocked && (
                <button
                  onClick={lockWallet}
                  title={t('actions.lockWallet')}
                  className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-300 hover:bg-red-900/50 text-gray-400 hover:text-red-400 transition text-xs font-medium"
                >
                  <Lock size={14} />
                  <span className="hidden xl:inline">{t('actions.lockWallet')}</span>
                </button>
              )}

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg bg-dark-300 text-white"
              >
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
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
            className="lg:hidden border-t border-dark-200 bg-dark-500"
          >
            <div className="px-4 py-3 space-y-1">
              {filteredNav.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${isActive
                        ? 'bg-gradient-orange text-white'
                        : 'text-gray-300 hover:bg-dark-300'
                      }`}
                  >
                    <Icon size={18} />
                    <span className="text-sm">{item.name}</span>
                  </Link>
                );
              })}
              {isUnlocked && (
                <button
                  onClick={() => {
                    lockWallet();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-900/30 transition text-sm"
                >
                  <Lock size={18} />
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
                <p className="font-semibold">{t('home.beta.title')}</p>
                <p className="text-gray-300">{t('home.beta.message')}</p>
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

      <BlockHeightWidget />
    </div>
  );
}
