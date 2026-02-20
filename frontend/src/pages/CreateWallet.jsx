import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Copy, Eye, EyeOff, Check, AlertTriangle, RefreshCw, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import useWalletStore from '../store/walletStore';
import * as keyService from '../services/keyService';

export default function CreateWallet() {
  const navigate = useNavigate();
  const { createVault } = useWalletStore();

  const [step, setStep] = useState(1);
  const [mnemonic, setMnemonic] = useState('');
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [verificationWords, setVerificationWords] = useState([]);
  const [userVerification, setUserVerification] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    generateNewMnemonic();
  }, []);

  const generateNewMnemonic = () => {
    const m = keyService.generateMnemonic(128);
    setMnemonic(m);
    const words = m.split(' ');
    const indices = [];
    while (indices.length < 3) {
      const r = Math.floor(Math.random() * words.length);
      if (!indices.includes(r)) indices.push(r);
    }
    setVerificationWords(indices.sort((a, b) => a - b));
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
    const words = mnemonic.split(' ');
    const expectedWords = verificationWords.map(i => words[i]).join(' ');
    if (userVerification.trim().toLowerCase() !== expectedWords.toLowerCase()) {
      toast.error('Verifizierung fehlgeschlagen. Bitte überprüfen Sie Ihre Eingabe.');
      return;
    }
    setStep(3);
  };

  const finalizeWallet = async () => {
    if (password.length < 6) {
      toast.error('Passwort muss mindestens 6 Zeichen haben.');
      return;
    }
    if (password !== passwordConfirm) {
      toast.error('Passwörter stimmen nicht überein.');
      return;
    }
    try {
      setLoading(true);
      await createVault(mnemonic, password);
      toast.success('Wallet erfolgreich erstellt!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(`Fehler: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold glow-text">Neue Wallet erstellen</h1>
          <p className="text-gray-400">
            Schritt {step} von 3: {step === 1 ? 'Seed sichern' : step === 2 ? 'Verifizierung' : 'Passwort festlegen'}
          </p>
        </div>

        {/* Step 1: Display Seed */}
        {step === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="card border-b1t-orange/50 bg-b1t-orange/10">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="text-b1t-orange mt-1" size={24} />
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Wichtig!</h3>
                  <p className="text-sm text-gray-300">
                    Ihr Seed ist der <span className="text-b1t-orange font-semibold">einzige Weg</span>,
                    um Ihre Wallet wiederherzustellen.
                  </p>
                  <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">
                    <li>Schreiben Sie ihn auf Papier</li>
                    <li>Bewahren Sie ihn an einem sicheren Ort auf</li>
                    <li>Teilen Sie ihn niemals mit anderen</li>
                    <li>Speichern Sie ihn NICHT digital</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="card space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">Ihr Recovery Seed</h3>
                <div className="flex space-x-2">
                  <button onClick={() => setShowMnemonic(!showMnemonic)} className="p-2 rounded-lg bg-dark-200 hover:bg-dark-100 transition">
                    {showMnemonic ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                  <button onClick={copyToClipboard} className="p-2 rounded-lg bg-dark-200 hover:bg-dark-100 transition">
                    <Copy size={20} />
                  </button>
                  <button onClick={generateNewMnemonic} className="p-2 rounded-lg bg-dark-200 hover:bg-dark-100 transition">
                    <RefreshCw size={20} />
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

            <div className="card space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-dark-200 text-b1t-orange focus:ring-b1t-orange" />
                <span className="text-sm">
                  Ich habe meinen Recovery Seed sicher aufgeschrieben und verstanden,
                  dass ich ohne ihn keinen Zugriff mehr auf meine Wallet habe.
                </span>
              </label>
            </div>

            <button onClick={proceedToVerification} disabled={!confirmed}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
              Weiter zur Verifizierung
            </button>
          </motion.div>
        )}

        {/* Step 2: Verification */}
        {step === 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="card space-y-4">
              <h3 className="font-semibold text-lg">Seed verifizieren</h3>
              <p className="text-gray-400 text-sm">
                Geben Sie die folgenden Wörter ein, um zu bestätigen, dass Sie ihn korrekt notiert haben:
              </p>
              <div className="space-y-2">
                <p className="text-b1t-orange font-semibold">
                  Wort {verificationWords[0] + 1}, Wort {verificationWords[1] + 1}, Wort {verificationWords[2] + 1}
                </p>
                <input type="text" value={userVerification} onChange={(e) => setUserVerification(e.target.value)}
                  placeholder="Wort1 Wort2 Wort3" className="input" />
              </div>
            </div>
            <div className="flex space-x-4">
              <button onClick={() => setStep(1)} className="btn-secondary flex-1">Zurück</button>
              <button onClick={verifyAndCreateWallet} disabled={!userVerification}
                className="btn-primary flex-1 disabled:opacity-50">Weiter</button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Set Password */}
        {step === 3 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="card space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <Lock size={24} className="text-b1t-orange" />
                <h3 className="font-semibold text-lg">Wallet-Passwort festlegen</h3>
              </div>
              <p className="text-gray-400 text-sm">
                Dieses Passwort verschlüsselt Ihren Seed lokal im Browser.
                Sie benötigen es jedes Mal zum Entsperren der Wallet.
              </p>
              <div className="space-y-3">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Passwort (min. 6 Zeichen)" className="input" autoFocus />
                <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Passwort bestätigen" className="input" />
              </div>
              {password && password.length < 6 && (
                <p className="text-red-400 text-xs">Mindestens 6 Zeichen erforderlich</p>
              )}
              {passwordConfirm && password !== passwordConfirm && (
                <p className="text-red-400 text-xs">Passwörter stimmen nicht überein</p>
              )}
            </div>
            <div className="flex space-x-4">
              <button onClick={() => setStep(2)} className="btn-secondary flex-1" disabled={loading}>Zurück</button>
              <button onClick={finalizeWallet} disabled={loading || password.length < 6 || password !== passwordConfirm}
                className="btn-primary flex-1 disabled:opacity-50">
                {loading ? 'Erstelle Wallet...' : 'Wallet erstellen'}
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

