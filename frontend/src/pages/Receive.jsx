import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Download, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import useWalletStore from '../store/walletStore';

export default function Receive() {
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
    toast.success('Adresse kopiert!');
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
      
      toast.success('QR-Code heruntergeladen!');
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
          <h1 className="text-4xl font-bold glow-text">B1T empfangen</h1>
          <p className="text-gray-400">
            Teilen Sie diese Adresse oder den QR-Code, um B1T zu empfangen
          </p>
        </div>

        <div className="card space-y-6">
          {/* Address selector */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold">Adresse auswählen</label>
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
              {(addresses || []).map((a, i) => (
                <option key={i} value={i}>
                  #{i} · {a.address}
                </option>
              ))}
            </select>
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="p-6 bg-white rounded-xl"
            >
              <QRCodeSVG
                id="qr-code"
                value={address}
                size={256}
                level="H"
                includeMargin={true}
                imageSettings={{
                  src: "/B1T-logo.png",
                  height: 48,
                  width: 48,
                  excavate: true,
                }}
              />
            </motion.div>
          </div>

          {/* Address */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-center">
              Ihre B1T Adresse
            </label>
            <div className="relative">
              <input
                type="text"
                value={address}
                readOnly
                className="input font-mono text-center pr-12"
              />
              <button
                onClick={copyToClipboard}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-dark-300 hover:bg-dark-200 transition"
              >
                {copied ? (
                  <Check size={20} className="text-green-500" />
                ) : (
                  <Copy size={20} />
                )}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={copyToClipboard}
              className="btn-secondary flex-1"
            >
              <Copy size={18} className="inline mr-2" />
              Adresse kopieren
            </button>
            <button
              onClick={downloadQR}
              className="btn-primary flex-1"
            >
              <Download size={18} className="inline mr-2" />
              QR-Code speichern
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="card bg-dark-400 space-y-3">
          <h3 className="font-semibold">💡 Hinweise</h3>
          <ul className="text-sm text-gray-400 space-y-2">
            <li>• Diese Adresse kann beliebig oft verwendet werden</li>
            <li>• B1T-Transaktionen benötigen mindestens 6 Bestätigungen</li>
            <li>• Senden Sie nur B1T an diese Adresse</li>
            <li>• Der QR-Code enthält Ihre vollständige Adresse</li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}


