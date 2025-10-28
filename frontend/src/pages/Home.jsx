import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Wallet, Download, Shield, Zap, Github } from 'lucide-react';
import useWalletStore from '../store/walletStore';
import { useTranslation } from 'react-i18next';

export default function Home() {
  const { isUnlocked } = useWalletStore();
  const { t } = useTranslation();

  const features = [
    {
      icon: Shield,
      title: t('home.features.nonCustodial.title'),
      description: t('home.features.nonCustodial.desc'),
    },
    {
      icon: Zap,
      title: t('home.features.ordinals.title'),
      description: t('home.features.ordinals.desc'),
    },
    {
      icon: Wallet,
      title: t('home.features.bip39.title'),
      description: t('home.features.bip39.desc'),
    },
    {
      icon: Github,
      title: t('home.features.openSource.title'),
      description: t('home.features.openSource.desc'),
    },
  ];

  return (
    <div className="space-y-20">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center space-y-8 py-20"
      >
        <motion.img
          src="/B1T-logo.png"
          alt="B1T Logo"
          className="h-32 w-32 mx-auto logo-glow"
          animate={{ 
            rotate: [0, 5, -5, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{ 
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        
        <h1 className="text-6xl md:text-7xl font-bold">
          <span className="glow-text">B1T Wallet</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto">
          {t('home.hero.subtitle')}
          <br />
          <span className="text-b1t-orange">{t('home.hero.tagline')}</span>
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          {isUnlocked ? (
            <Link to="/dashboard" className="btn-primary text-lg px-8 py-4">
              {t('home.cta.dashboard')}
            </Link>
          ) : (
            <>
              <Link to="/create" className="btn-primary text-lg px-8 py-4">
                <Wallet className="inline mr-2" size={20} />
                {t('home.cta.create')}
              </Link>
              <Link to="/import" className="btn-secondary text-lg px-8 py-4">
                <Download className="inline mr-2" size={20} />
                {t('home.cta.import')}
              </Link>
            </>
          )}
        </div>
      </motion.div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="card hover:border-b1t-orange/50 transition-all duration-300"
            >
              <div className="text-b1t-orange mb-4">
                <Icon size={40} />
              </div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-400 text-sm">{feature.description}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Info Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="card max-w-4xl mx-auto text-center space-y-6"
      >
        <h2 className="text-3xl font-bold glow-text">
          {t('home.info.title')}
        </h2>
        <p className="text-gray-300 text-lg leading-relaxed">
          {t('home.info.desc')}
        </p>
        <div className="pt-4">
          <span className="text-b1t-orange font-semibold">
            {t('home.info.phase')}
          </span>
        </div>
      </motion.div>
    </div>
  );
}


