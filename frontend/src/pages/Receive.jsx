import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Download, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import useWalletStore from '../store/walletStore';
import { useTranslation } from 'react-i18next';

export default function Receive() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isUnlocked, getCurrentAddress, addresses, currentAddressIndex, setCurrentAddress } = useWalletStore();
  
  const [copied, setCopied] = useState(false);
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (!isUnlocked) {
      navigate('/');
      return;
    }

    const currentAddr = getCurrentAddress();
    if (currentAddr) {
      setAddress(currentAddr.address);
    }
  }, [isUnlocked, navigate]);

  useEffect(() => {
    const currentAddr = getCurrentAddress();
    if (currentAddr) setAddress(currentAddr.address);
  }, [currentAddressIndex, addresses]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success(t('receive.copied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQR = () => {
    const svg = document.getElementById('qr-code');
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      
      const downloadLink = document.createElement('a');
      downloadLink.download = `B1T-Address-${address.slice(0, 8)}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
      
      toast.success(t('receive.qrDownloaded'));
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  if (!address) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-b1t-orange"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 bg-gradient-orange rounded-full">
            <Download size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold glow-text">{t('receive.title')}</h1>
          <p className="text-gray-400">
            {t('receive.subtitle')}
          </p>
        </div>

        <div className="card space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold">{t('receive.selectAddress')}</label>
            <select
              value={currentAddressIndex}
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                setCurrentAddress(idx);
                const next = addresses?.[idx]?.address;
                if (next) setAddress(next);
              }}
              className="input"
            >
              {addresses && addresses.map((addr, i) => (
                <option key={i} value={i}>
                  #{i} - {addr.address.slice(0, 8)}...{addr.address.slice(-8)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-center">
            <div className="p-6 bg-white rounded-2xl">
              <QRCodeSVG id="qr-code" value={address} size={200} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold">{t('receive.yourAddress')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={address}
                readOnly
                className="input font-mono text-sm flex-1"
              />
              <button onClick={copyToClipboard}
                className="btn-secondary flex items-center gap-2">
                {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                {copied ? t('receive.copiedBtn') : t('receive.copyBtn')}
              </button>
            </div>
          </div>

          <button onClick={downloadQR} className="btn-secondary w-full">
            {t('receive.downloadQR')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
