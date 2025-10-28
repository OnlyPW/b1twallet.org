import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Copy, Eye, EyeOff, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { walletApi } from '../services/api';
import useWalletStore from '../store/walletStore';

export default function CreateWallet() {
  const navigate = useNavigate();
  const { unlockWallet } = useWalletStore();
  
  const [step, setStep] = useState(1);
  const [mnemonic, setMnemonic] = useState('');
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [verificationWords, setVerificationWords] = useState([]);
  const [userVerification, setUserVerification] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    generateNewMnemonic();
  }, []);

  const generateNewMnemonic = async () => {
    try {
      setLoading(true);
      const response = await walletApi.generateMnemonic(128); // 12 words
      setMnemonic(response.mnemonic);
      
      // Select 3 random words for verification
      const words = response.mnemonic.split(' ');
      const randomIndices = [];
      while (randomIndices.length < 3) {
        const rand = Math.floor(Math.random() * words.length);
        if (!randomIndices.includes(rand)) randomIndices.push(rand);
      }
      setVerificationWords(randomIndices.sort((a, b) => a - b));
    } catch (error) {
      toast.error(`Fehler: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(mnemonic);
    toast.success('Seed wurde kopiert!');
  };

  const proceedToVerification = () => {
    if (!confirmed) {
      toast.error('Bitte bestätigen Sie, dass Sie Ihren Seed gesichert haben.');
      return;
    }
    setStep(2);
  };

  const verifyAndCreateWallet = async () => {
    try {
      setLoading(true);
      
      // Verify user input
      const words = mnemonic.split(' ');
      const expectedWords = verificationWords.map(i => words[i]).join(' ');
      
      if (userVerification.trim().toLowerCase() !== expectedWords.toLowerCase()) {
        toast.error('Verifizierung fehlgeschlagen. Bitte überprüfen Sie Ihre Eingabe.');
        return;
      }

      // Derive addresses
      const response = await walletApi.deriveAddresses(mnemonic, 5);
      
      if (response.success) {
        unlockWallet(response.addresses);
        toast.success('Wallet erfolgreich erstellt!');
        
        // Seed lokal speichern, bleibt bis Logout/Cache-Löschung
        try { localStorage.setItem('b1t_mnemonic', mnemonic); } catch {}
        
        navigate('/dashboard');
      }
    } catch (error) {
      toast.error(`Fehler: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold glow-text">Neue Wallet erstellen</h1>
          <p className="text-gray-400">
            Schritt {step} von 2: {step === 1 ? 'Seed sichern' : 'Verifizierung'}
          </p>
        </div>

        {/* Step 1: Display Seed */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Warning */}
            <div className="card border-b1t-orange/50 bg-b1t-orange/10">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="text-b1t-orange mt-1" size={24} />
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Wichtig!</h3>
                  <p className="text-sm text-gray-300">
                    Ihr Seed ist der <span className="text-b1t-orange font-semibold">einzige Weg</span>, 
                    um Ihre Wallet wiederherzustellen. Bewahren Sie ihn sicher auf:
                  </p>
                  <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">
                    <li>Schreiben Sie ihn auf Papier</li>
                    <li>Bewahren Sie ihn an einem sicheren Ort auf</li>
                    <li>Teilen Sie ihn niemals mit anderen</li>
                    <li>Speichern Sie ihn NICHT digital (Screenshot, Cloud, etc.)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Mnemonic Display */}
            <div className="card space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">Ihr Recovery Seed</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowMnemonic(!showMnemonic)}
                    className="p-2 rounded-lg bg-dark-200 hover:bg-dark-100 transition"
                    title={showMnemonic ? 'Seed verbergen' : 'Seed anzeigen'}
                  >
                    {showMnemonic ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                  <button
                    onClick={copyToClipboard}
                    className="p-2 rounded-lg bg-dark-200 hover:bg-dark-100 transition"
                    title="Kopieren"
                  >
                    <Copy size={20} />
                  </button>
                  <button
                    onClick={generateNewMnemonic}
                    className="p-2 rounded-lg bg-dark-200 hover:bg-dark-100 transition"
                    title="Neuen Seed generieren"
                    disabled={loading}
                  >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div className={`grid grid-cols-3 gap-3 p-4 rounded-lg bg-dark-200 ${!showMnemonic ? 'filter blur-sm' : ''}`}>
                {mnemonic.split(' ').map((word, index) => (
                  <div key={index} className="flex items-center space-x-2 p-2 bg-dark-300 rounded">
                    <span className="text-b1t-orange font-mono text-sm">{index + 1}.</span>
                    <span className="font-mono">{word}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Confirmation */}
            <div className="card space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-dark-200 text-b1t-orange focus:ring-b1t-orange"
                />
                <span className="text-sm">
                  Ich habe meinen Recovery Seed sicher aufgeschrieben und verstanden,
                  dass ich ohne ihn keinen Zugriff mehr auf meine Wallet habe.
                </span>
              </label>
            </div>

            <button
              onClick={proceedToVerification}
              disabled={!confirmed || loading}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Weiter zur Verifizierung
            </button>
          </motion.div>
        )}

        {/* Step 2: Verification */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <div className="card space-y-4">
              <h3 className="font-semibold text-lg">Seed verifizieren</h3>
              <p className="text-gray-400 text-sm">
                Bitte geben Sie die folgenden Wörter aus Ihrem Seed ein, um zu bestätigen,
                dass Sie ihn korrekt notiert haben:
              </p>

              <div className="space-y-2">
                <p className="text-b1t-orange font-semibold">
                  Wort {verificationWords[0] + 1}, Wort {verificationWords[1] + 1}, Wort {verificationWords[2] + 1}
                </p>
                <input
                  type="text"
                  value={userVerification}
                  onChange={(e) => setUserVerification(e.target.value)}
                  placeholder="Wort1 Wort2 Wort3"
                  className="input"
                />
                <p className="text-xs text-gray-500">
                  Trennen Sie die Wörter mit Leerzeichen
                </p>
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => setStep(1)}
                className="btn-secondary flex-1"
                disabled={loading}
              >
                Zurück
              </button>
              <button
                onClick={verifyAndCreateWallet}
                disabled={loading || !userVerification}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {loading ? 'Erstelle Wallet...' : 'Wallet erstellen'}
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}


