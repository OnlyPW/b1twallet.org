import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Download, AlertTriangle, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import useWalletStore from '../store/walletStore';
import * as keyService from '../services/keyService';
import { useTranslation } from 'react-i18next';

export default function ImportWallet() {
  const { t } = useTranslation();
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
      toast.error(t('importWallet.invalidSeed'));
      return;
    }
    setStep(2);
  };

  const handleFinalize = async () => {
    if (password.length < 6) {
      toast.error(t('importWallet.passwordTooShort'));
      return;
    }
    if (password !== passwordConfirm) {
      toast.error(t('importWallet.passwordMismatch'));
      return;
    }
    try {
      setLoading(true);
      await createVault(mnemonic.trim(), password);
      toast.success(t('importWallet.success'));
      navigate('/dashboard');
    } catch (error) {
      toast.error(t('importWallet.error') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setMnemonic(text.trim());
      toast.success(t('importWallet.pasted'));
    } catch {
      toast.error(t('importWallet.pasteFailed'));
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 bg-gradient-orange rounded-full">
            <Download size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold glow-text">{t('importWallet.title')}</h1>
          <p className="text-gray-400">
            {step === 1 ? t('importWallet.step1Desc') : t('importWallet.step2Desc')}
          </p>
        </div>

        {step === 1 && (
          <>
            <div className="card border-b1t-orange/50 bg-b1t-orange/10">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="text-b1t-orange mt-1 flex-shrink-0" size={24} />
                <div className="space-y-2">
                  <h3 className="font-semibold">{t('importWallet.securityNote')}</h3>
                  <p className="text-sm text-gray-300">
                    {t('importWallet.securityDesc')}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleValidate} className="space-y-6">
              <div className="card space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold mb-2 block">{t('importWallet.seedLabel')}</span>
                  <textarea value={mnemonic} onChange={(e) => setMnemonic(e.target.value)}
                    placeholder={t('importWallet.seedPlaceholder')} rows={4}
                    className="input resize-none font-mono text-sm" required />
                </label>
                <button type="button" onClick={handlePaste}
                  className="text-sm text-b1t-orange hover:text-b1t-orange-400 transition">
                  {t('importWallet.pasteFromClipboard')}
                </button>
              </div>
              <button type="submit" disabled={!mnemonic.trim()} className="btn-primary w-full disabled:opacity-50">
                {t('importWallet.continue')}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="card space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <Lock className="text-b1t-orange" size={24} />
                <h3 className="font-semibold text-lg">{t('importWallet.setPassword')}</h3>
              </div>
              <p className="text-gray-400 text-sm">
                {t('importWallet.setPasswordDesc')}
              </p>
              <div className="space-y-3">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('importWallet.passwordPlaceholder')} className="input" />
                <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder={t('importWallet.passwordConfirmPlaceholder')} className="input" />
              </div>
              {password && password.length < 6 && (
                <p className="text-red-400 text-xs">{t('importWallet.passwordTooShort')}</p>
              )}
              {passwordConfirm && password !== passwordConfirm && (
                <p className="text-red-400 text-xs">{t('importWallet.passwordMismatch')}</p>
              )}
            </div>
            <div className="flex space-x-4">
              <button onClick={() => setStep(1)} className="btn-secondary flex-1" disabled={loading}>
                {t('importWallet.back')}
              </button>
              <button onClick={handleFinalize} disabled={loading || password.length < 6 || password !== passwordConfirm}
                className="btn-primary flex-1 disabled:opacity-50">
                {loading ? t('importWallet.importing') : t('importWallet.import')}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
