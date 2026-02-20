import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Download, AlertTriangle, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import useWalletStore from '../store/walletStore';
import * as keyService from '../services/keyService';

export default function ImportWallet() {
  const navigate = useNavigate();
  const { createVault } = useWalletStore();

  const [step, setStep] = useState(1);
  const [mnemonic, setMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleValidate = (e) => {
    e.preventDefault();
    if (!keyService.validateMnemonic(mnemonic.trim())) {
      toast.error('Ungültiger Recovery Seed');
      return;
    }
    setStep(2);
  };

  const handleFinalize = async () => {
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
      await createVault(mnemonic.trim(), password);
      toast.success('Wallet erfolgreich importiert!');
      navigate('/dashboard');
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
    } catch {
      toast.error('Zugriff auf Zwischenablage fehlgeschlagen');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 bg-gradient-orange rounded-full">
            <Download size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold glow-text">Wallet importieren</h1>
          <p className="text-gray-400">
            {step === 1 ? 'Geben Sie Ihren 12- oder 24-Wort Recovery Seed ein' : 'Passwort festlegen'}
          </p>
        </div>

        {step === 1 && (
          <>
            <div className="card border-b1t-orange/50 bg-b1t-orange/10">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="text-b1t-orange mt-1 flex-shrink-0" size={24} />
                <div className="space-y-2">
                  <h3 className="font-semibold">Sicherheitshinweis</h3>
                  <p className="text-sm text-gray-300">
                    Ihr Seed wird nur lokal in Ihrem Browser verarbeitet und verschlüsselt gespeichert.
                    Er wird niemals an einen Server gesendet.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleValidate} className="space-y-6">
              <div className="card space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold mb-2 block">Recovery Seed (12 oder 24 Wörter)</span>
                  <textarea value={mnemonic} onChange={(e) => setMnemonic(e.target.value)}
                    placeholder="word1 word2 word3 ..." rows={4}
                    className="input resize-none font-mono text-sm" required />
                </label>
                <button type="button" onClick={handlePaste}
                  className="text-sm text-b1t-orange hover:text-b1t-orange-400 transition">
                  Aus Zwischenablage einfügen
                </button>
              </div>
              <button type="submit" disabled={!mnemonic.trim()} className="btn-primary w-full disabled:opacity-50">
                Weiter
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="card space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <Lock size={24} className="text-b1t-orange" />
                <h3 className="font-semibold text-lg">Wallet-Passwort festlegen</h3>
              </div>
              <p className="text-gray-400 text-sm">
                Dieses Passwort verschlüsselt Ihren Seed lokal im Browser.
                Sie benötigen es jedes Mal zum Entsperren.
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
              <button onClick={() => setStep(1)} className="btn-secondary flex-1" disabled={loading}>Zurück</button>
              <button onClick={handleFinalize} disabled={loading || password.length < 6 || password !== passwordConfirm}
                className="btn-primary flex-1 disabled:opacity-50">
                {loading ? 'Importiere Wallet...' : 'Wallet importieren'}
              </button>
            </div>
          </motion.div>
        )}

        <div className="card bg-dark-400">
          <h3 className="font-semibold mb-3">Kompatibilität</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Kompatibel mit allen BIP39-Seeds. Adressen werden nach BIP44-Standard abgeleitet (m/44'/3141'/0'/0/x).
          </p>
        </div>
      </motion.div>
    </div>
  );
}
