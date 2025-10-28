import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Download, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { walletApi } from '../services/api';
import useWalletStore from '../store/walletStore';

export default function ImportWallet() {
  const navigate = useNavigate();
  const { unlockWallet } = useWalletStore();
  
  const [mnemonic, setMnemonic] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      // Validate mnemonic
      const validation = await walletApi.validateMnemonic(mnemonic.trim());
      
      if (!validation.valid) {
        toast.error('Ungültiger Recovery Seed');
        return;
      }

      // Derive addresses
      const response = await walletApi.deriveAddresses(mnemonic.trim(), 5);
      
      if (response.success) {
        unlockWallet(response.addresses);
        
        // Seed lokal speichern, bleibt bis Logout/Cache-Löschung
        try { localStorage.setItem('b1t_mnemonic', mnemonic.trim()); } catch {}
        
        toast.success('Wallet erfolgreich importiert!');
        navigate('/dashboard');
      }
    } catch (error) {
      toast.error(`Fehler: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setMnemonic(text.trim());
      toast.success('Aus Zwischenablage eingefügt');
    } catch (error) {
      toast.error('Zugriff auf Zwischenablage fehlgeschlagen');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 bg-gradient-orange rounded-full">
            <Download size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold glow-text">Wallet importieren</h1>
          <p className="text-gray-400">
            Geben Sie Ihren 12- oder 24-Wort Recovery Seed ein
          </p>
        </div>

        {/* Warning */}
        <div className="card border-b1t-orange/50 bg-b1t-orange/10">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="text-b1t-orange mt-1 flex-shrink-0" size={24} />
            <div className="space-y-2">
              <h3 className="font-semibold">Sicherheitshinweis</h3>
              <p className="text-sm text-gray-300">
                Geben Sie Ihren Seed niemals auf unbekannten Websites ein.
                Diese Wallet läuft lokal in Ihrem Browser - Ihr Seed wird
                niemals an einen Server gesendet.
              </p>
            </div>
          </div>
        </div>

        {/* Import Form */}
        <form onSubmit={handleImport} className="space-y-6">
          <div className="card space-y-4">
            <label className="block">
              <span className="text-sm font-semibold mb-2 block">
                Recovery Seed (12 oder 24 Wörter)
              </span>
              <textarea
                value={mnemonic}
                onChange={(e) => setMnemonic(e.target.value)}
                placeholder="word1 word2 word3 ..."
                rows={4}
                className="input resize-none font-mono text-sm"
                required
              />
            </label>

            <button
              type="button"
              onClick={handlePaste}
              className="text-sm text-b1t-orange hover:text-b1t-orange-400 transition"
            >
              Aus Zwischenablage einfügen
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || !mnemonic.trim()}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Importiere Wallet...' : 'Wallet importieren'}
          </button>
        </form>

        {/* Help Text */}
        <div className="card bg-dark-400">
          <h3 className="font-semibold mb-3">💡 Kompatibilität</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Diese Wallet ist kompatibel mit allen BIP39-Seeds, einschließlich
            Seeds aus dem BitWebWallet. Ihre Adressen werden automatisch nach
            dem BIP44-Standard abgeleitet (m/44'/0'/0'/0/x).
          </p>
        </div>
      </motion.div>
    </div>
  );
}


