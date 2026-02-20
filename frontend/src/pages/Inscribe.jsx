import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Image, FileText, Upload, X, CheckCircle, Loader, Rocket, Coins, ArrowRightLeft, Code, Info, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { walletApi } from '../services/api';
import useWalletStore from '../store/walletStore';
import { useTranslation } from 'react-i18next';

const MAX_FILE_SIZE = 400 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function arrayBufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export default function Inscribe() {
  const navigate = useNavigate();
  const { isUnlocked, addresses, currentAddressIndex } = useWalletStore();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState('image');

  // Image state
  const [originalFile, setOriginalFile] = useState(null);
  const [originalUrl, setOriginalUrl] = useState(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedUrl, setCompressedUrl] = useState(null);
  const [compressedSize, setCompressedSize] = useState(0);
  const [compressedBlob, setCompressedBlob] = useState(null);
  const [quality, setQuality] = useState(75);
  const [isDragging, setIsDragging] = useState(false);

  // Token state
  const [tokenData, setTokenData] = useState('');
  const [tokenMode, setTokenMode] = useState('form');
  const [tokenOp, setTokenOp] = useState('deploy');
  const [tokenTick, setTokenTick] = useState('');
  const [tokenMax, setTokenMax] = useState('');
  const [tokenLim, setTokenLim] = useState('');
  const [tokenDec, setTokenDec] = useState('8');
  const [tokenAmt, setTokenAmt] = useState('');

  // Common state
  const [toAddress, setToAddress] = useState('');
  const [mintAddress, setMintAddress] = useState('');
  const [mintPrice, setMintPrice] = useState('');
  const [fromIndex, setFromIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [estimate, setEstimate] = useState(null);

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isUnlocked) {
      navigate('/');
    }
    setFromIndex(currentAddressIndex || 0);
  }, [isUnlocked, navigate, currentAddressIndex]);

  // Build tokenData JSON from form fields
  useEffect(() => {
    if (tokenMode !== 'form') return;
    const obj = { p: 'b1t-20', op: tokenOp };
    if (tokenTick.trim()) obj.tick = tokenTick.trim().toUpperCase();
    if (tokenOp === 'deploy') {
      if (tokenMax) obj.max = tokenMax;
      if (tokenLim) obj.lim = tokenLim;
      if (tokenDec) obj.dec = tokenDec;
    }
    if ((tokenOp === 'mint' || tokenOp === 'transfer') && tokenAmt) {
      obj.amt = tokenAmt;
    }
    setTokenData(JSON.stringify(obj, null, 2));
  }, [tokenMode, tokenOp, tokenTick, tokenMax, tokenLim, tokenDec, tokenAmt]);

  // Compress image whenever quality or file changes
  const compressImage = useCallback((file, q) => {
    if (!file) return;
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            setCompressedBlob(blob);
            setCompressedSize(blob.size);
            const cUrl = URL.createObjectURL(blob);
            setCompressedUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return cUrl; });
          }
        },
        'image/webp',
        q / 100
      );
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  useEffect(() => {
    if (originalFile) {
      compressImage(originalFile, quality);
    }
  }, [originalFile, quality, compressImage]);

  // Estimate cost when data changes
  useEffect(() => {
    const size = activeTab === 'image' ? compressedSize : new TextEncoder().encode(tokenData).length;
    if (size > 0) {
      walletApi.estimateInscription(size).then(res => {
        if (res.success !== false) setEstimate(res);
      }).catch(() => {});
    } else {
      setEstimate(null);
    }
  }, [compressedSize, tokenData, activeTab]);

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('inscribe.onlyImages'));
      return;
    }
    setOriginalFile(file);
    setOriginalSize(file.size);
    setOriginalUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setResult(null);
  };

  const clearImage = () => {
    setOriginalFile(null);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (compressedUrl) URL.revokeObjectURL(compressedUrl);
    setOriginalUrl(null);
    setCompressedUrl(null);
    setOriginalSize(0);
    setCompressedSize(0);
    setCompressedBlob(null);
    setResult(null);
    setEstimate(null);
  };

  const handleInscribe = async () => {
    const { getWIF } = useWalletStore.getState();
    const addrList = addresses || [];
    const selectedAddr = addrList[fromIndex];
    if (!selectedAddr) {
      toast.error(t('inscribe.noAddress'));
      return;
    }

    const wif = getWIF(selectedAddr.index ?? fromIndex);
    if (!wif) {
      toast.error(t('inscribe.walletLocked'));
      navigate('/');
      return;
    }

    let contentType, hexData;

    if (activeTab === 'image') {
      if (!compressedBlob) {
        toast.error(t('inscribe.noImage'));
        return;
      }
      if (compressedSize > MAX_FILE_SIZE) {
        toast.error(t('inscribe.imageTooLarge', { size: formatBytes(compressedSize), max: formatBytes(MAX_FILE_SIZE) }));
        return;
      }
      contentType = 'image/webp';
      const arrayBuffer = await compressedBlob.arrayBuffer();
      hexData = arrayBufferToHex(arrayBuffer);
    } else {
      if (!tokenData.trim()) {
        toast.error(t('inscribe.noTokenData'));
        return;
      }
      const encoded = new TextEncoder().encode(tokenData);
      if (encoded.length > MAX_FILE_SIZE) {
        toast.error(t('inscribe.dataTooLarge', { size: formatBytes(encoded.length), max: formatBytes(MAX_FILE_SIZE) }));
        return;
      }
      contentType = tokenData.trim().startsWith('{') ? 'application/json' : 'text/plain';
      hexData = arrayBufferToHex(encoded.buffer);
    }

    try {
      setLoading(true);
      setProgress({ step: 0, total: 0, message: t('inscribe.creating') });
      setResult(null);

      const response = await walletApi.inscribeOrdinal({
        wif,
        senderAddress: selectedAddr.address,
        toAddress: toAddress || selectedAddr.address,
        contentType,
        hexData,
        mintAddress: mintAddress || undefined,
        mintPrice: mintPrice ? parseInt(mintPrice) : undefined,
      });

      if (response.success) {
        setProgress({ step: response.totalTransactions, total: response.totalTransactions, message: t('inscribe.done') });
        setResult(response);
        toast.success(t('inscribe.successToast', { count: response.totalTransactions }));
      } else {
        throw new Error(response.error || t('inscribe.failed'));
      }
    } catch (error) {
      toast.error(t('inscribe.error', { message: error.message }));
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const formatShort = (addr) => `${addr.slice(0, 8)}...${addr.slice(-8)}`;
  const dataSize = activeTab === 'image' ? compressedSize : new TextEncoder().encode(tokenData).length;
  const dataTooLarge = dataSize > MAX_FILE_SIZE;

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 bg-gradient-orange rounded-full">
            <Image size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold glow-text">{t('inscribe.title')}</h1>
          <p className="text-gray-400">{t('inscribe.subtitle')}</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-dark-200">
          <button
            className={`px-6 py-3 text-lg font-semibold flex items-center gap-2 transition ${activeTab === 'image' ? 'text-b1t-orange border-b-2 border-b1t-orange' : 'text-gray-400 hover:text-gray-200'}`}
            onClick={() => setActiveTab('image')}
          >
            <Image size={20} /> {t('inscribe.tabImage')}
          </button>
          <button
            className={`px-6 py-3 text-lg font-semibold flex items-center gap-2 transition ${activeTab === 'token' ? 'text-b1t-orange border-b-2 border-b1t-orange' : 'text-gray-400 hover:text-gray-200'}`}
            onClick={() => setActiveTab('token')}
          >
            <FileText size={20} /> {t('inscribe.tabToken')}
          </button>
        </div>

        {/* Image Tab */}
        {activeTab === 'image' && (
          <div className="space-y-6">
            {!originalFile ? (
              <div
                className={`card border-2 border-dashed transition-colors cursor-pointer ${isDragging ? 'border-b1t-orange bg-b1t-orange/10' : 'border-dark-200 hover:border-b1t-orange/50'}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Upload size={48} className="mb-4 opacity-50" />
                  <p className="text-lg font-semibold">{t('inscribe.dropzone')}</p>
                  <p className="text-sm mt-1">{t('inscribe.dropzoneFormats')}</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileDrop}
                />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Side by Side Preview */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">{t('inscribe.preview')}</h3>
                    <button onClick={clearImage} className="p-2 rounded-lg hover:bg-dark-200 transition text-gray-400 hover:text-white">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Original */}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-gray-300 text-center">{t('inscribe.original')}</p>
                      <div className="relative rounded-lg overflow-hidden bg-dark-300 flex items-center justify-center" style={{ minHeight: 200 }}>
                        {originalUrl && (
                          <img src={originalUrl} alt="Original" className="max-w-full max-h-64 object-contain" />
                        )}
                      </div>
                      <div className="text-center">
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-mono bg-dark-300 text-gray-300">
                          {formatBytes(originalSize)}
                        </span>
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-mono bg-dark-300 text-gray-400 ml-2">
                          {originalFile?.type}
                        </span>
                      </div>
                    </div>

                    {/* Compressed */}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-b1t-orange text-center">{t('inscribe.compressed')}</p>
                      <div className="relative rounded-lg overflow-hidden bg-dark-300 flex items-center justify-center" style={{ minHeight: 200 }}>
                        {compressedUrl && (
                          <img src={compressedUrl} alt="Komprimiert" className="max-w-full max-h-64 object-contain" />
                        )}
                      </div>
                      <div className="text-center">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-mono ${dataTooLarge ? 'bg-red-900/50 text-red-400' : 'bg-b1t-orange/20 text-b1t-orange'}`}>
                          {formatBytes(compressedSize)}
                        </span>
                        {originalSize > 0 && (
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-mono bg-dark-300 text-green-400 ml-2">
                            -{Math.round((1 - compressedSize / originalSize) * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quality Slider */}
                  <div className="mt-6 space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold">{t('inscribe.quality')}</label>
                      <span className="text-sm font-mono text-b1t-orange">{quality}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={quality}
                      onChange={(e) => setQuality(parseInt(e.target.value))}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-b1t-orange bg-dark-300"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{t('inscribe.qualityLow')}</span>
                      <span>{t('inscribe.qualityHigh')}</span>
                    </div>
                  </div>

                  {dataTooLarge && (
                    <div className="mt-4 p-3 rounded bg-red-900/30 border border-red-500/50 text-red-400 text-sm">
                      {t('inscribe.imageTooLarge', { size: formatBytes(compressedSize), max: formatBytes(MAX_FILE_SIZE) })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Token Tab */}
        {activeTab === 'token' && (
          <div className="space-y-6">
            {/* Alpha Warning */}
            <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-500/30 flex items-start gap-3">
              <AlertTriangle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-yellow-400">{t('tokens.alphaTitle')}</p>
                <p className="text-gray-400 mt-1">{t('tokens.alphaDesc')}</p>
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setTokenMode('form')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${tokenMode === 'form' ? 'bg-b1t-orange text-white' : 'bg-dark-300 text-gray-400 hover:text-white'}`}
              >
                <Coins size={16} /> {t('inscribe.formMode')}
              </button>
              <button
                onClick={() => setTokenMode('raw')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${tokenMode === 'raw' ? 'bg-b1t-orange text-white' : 'bg-dark-300 text-gray-400 hover:text-white'}`}
              >
                <Code size={16} /> {t('inscribe.rawMode')}
              </button>
            </div>

            {tokenMode === 'form' ? (
              <div className="card space-y-5">
                {/* Operation Selection */}
                <div>
                  <label className="block text-sm font-semibold mb-3">{t('inscribe.operation')}</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'deploy', label: t('inscribe.opDeploy'), desc: t('inscribe.opDeployDesc'), icon: Rocket },
                      { id: 'mint', label: t('inscribe.opMint'), desc: t('inscribe.opMintDesc'), icon: Coins },
                      { id: 'transfer', label: t('inscribe.opTransfer'), desc: t('inscribe.opTransferDesc'), icon: ArrowRightLeft },
                    ].map(op => {
                      const Icon = op.icon;
                      return (
                        <button
                          key={op.id}
                          onClick={() => setTokenOp(op.id)}
                          className={`p-4 rounded-lg border-2 transition text-left ${tokenOp === op.id ? 'border-b1t-orange bg-b1t-orange/10' : 'border-dark-200 hover:border-dark-100 bg-dark-300'}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon size={18} className={tokenOp === op.id ? 'text-b1t-orange' : 'text-gray-400'} />
                            <span className={`font-semibold ${tokenOp === op.id ? 'text-b1t-orange' : 'text-white'}`}>{op.label}</span>
                          </div>
                          <p className="text-xs text-gray-400">{op.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Ticker */}
                <div>
                  <label className="block text-sm font-semibold mb-2">{t('inscribe.ticker')}</label>
                  <input
                    type="text"
                    value={tokenTick}
                    onChange={(e) => setTokenTick(e.target.value.toUpperCase().slice(0, 10))}
                    placeholder={t('inscribe.tickerPlaceholder')}
                    className="input font-mono uppercase"
                    maxLength={10}
                  />
                  <p className="text-xs text-gray-400 mt-1">{t('inscribe.tickerHint')}</p>
                </div>

                {/* Deploy-specific fields */}
                {tokenOp === 'deploy' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-semibold mb-2">{t('inscribe.maxSupply')}</label>
                        <input
                          type="text"
                          value={tokenMax}
                          onChange={(e) => setTokenMax(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder={t('inscribe.maxSupplyPlaceholder')}
                          className="input font-mono"
                        />
                        <p className="text-xs text-gray-400 mt-1">{t('inscribe.maxSupplyHint')}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2">{t('inscribe.mintLimit')}</label>
                        <input
                          type="text"
                          value={tokenLim}
                          onChange={(e) => setTokenLim(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder={t('inscribe.mintLimitPlaceholder')}
                          className="input font-mono"
                        />
                        <p className="text-xs text-gray-400 mt-1">{t('inscribe.mintLimitHint')}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2">{t('inscribe.decimals')}</label>
                        <select
                          value={tokenDec}
                          onChange={(e) => setTokenDec(e.target.value)}
                          className="input font-mono"
                        >
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 18].map(d => (
                            <option key={d} value={String(d)}>{d}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-1">{t('inscribe.decimalsHint')}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Mint / Transfer amount */}
                {(tokenOp === 'mint' || tokenOp === 'transfer') && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                    <label className="block text-sm font-semibold mb-2">{t('inscribe.amount')}</label>
                    <input
                      type="text"
                      value={tokenAmt}
                      onChange={(e) => setTokenAmt(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder={tokenOp === 'mint' ? 'z.B. 1000' : 'z.B. 500'}
                      className="input font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {tokenOp === 'mint' ? t('inscribe.amountMintHint') : t('inscribe.amountTransferHint')}
                    </p>
                  </motion.div>
                )}

                {/* Live JSON Preview */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-400">{t('inscribe.jsonPreview')}</label>
                  <div className="p-3 rounded-lg bg-dark-300 font-mono text-sm text-b1t-orange whitespace-pre overflow-x-auto">
                    {tokenData || '{}'}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {t('inscribe.size')}: {formatBytes(new TextEncoder().encode(tokenData).length)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="card space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">{t('inscribe.rawJson')}</label>
                  <textarea
                    value={tokenData}
                    onChange={(e) => setTokenData(e.target.value)}
                    placeholder={'{\n  "p": "b1t-20",\n  "op": "mint",\n  "tick": "EXAMPLE",\n  "amt": "1000"\n}'}
                    rows={8}
                    className="input font-mono text-sm resize-y"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {t('inscribe.size')}: {formatBytes(new TextEncoder().encode(tokenData).length)}
                    {tokenData.trim().startsWith('{') && <span className="ml-2 text-b1t-orange">{t('inscribe.jsonDetected')}</span>}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        {(activeTab === 'image' ? !!originalFile : !!tokenData.trim()) && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-4">
            <h3 className="text-lg font-semibold">{t('inscribe.settings')}</h3>

            <div>
              <label className="block text-sm font-semibold mb-2">{t('inscribe.fromAddress')}</label>
              <select
                value={fromIndex}
                onChange={(e) => setFromIndex(parseInt(e.target.value))}
                className="input"
              >
                {(addresses || []).map((a, i) => (
                  <option key={i} value={i}>#{i} — {formatShort(a.address)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">{t('inscribe.toAddress')}</label>
              <input
                type="text"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder={t('inscribe.toAddressPlaceholder')}
                className="input font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">{t('inscribe.toAddressHint')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">{t('inscribe.mintAddress')}</label>
                <input
                  type="text"
                  value={mintAddress}
                  onChange={(e) => setMintAddress(e.target.value)}
                  placeholder="B..."
                  className="input font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">{t('inscribe.mintPriceSats')}</label>
                <input
                  type="number"
                  value={mintPrice}
                  onChange={(e) => setMintPrice(e.target.value)}
                  placeholder="0"
                  className="input font-mono text-sm"
                />
              </div>
            </div>

            {/* Cost Estimate */}
            {estimate && (
              <div className="p-4 rounded-lg bg-dark-200 space-y-2">
                <h4 className="text-sm font-semibold text-gray-300">{t('inscribe.estimatedCost')}</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-400">{t('inscribe.estTransactions')}:</span>
                    <span className="ml-2 font-mono text-white">{estimate.estimatedTransactions}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">{t('inscribe.estDataSize')}:</span>
                    <span className="ml-2 font-mono text-white">{formatBytes(dataSize)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">{t('inscribe.estPlatformFee')}:</span>
                    <span className="ml-2 font-mono text-b1t-orange">{estimate.platformFeeB1T?.toFixed(2)} B1T</span>
                  </div>
                  <div>
                    <span className="text-gray-400">{t('inscribe.estTotal')}:</span>
                    <span className="ml-2 font-mono text-b1t-orange font-semibold">{estimate.estimatedCostB1T?.toFixed(2)} B1T</span>
                  </div>
                </div>
              </div>
            )}

            {/* Fee Info */}
            <div className="p-4 rounded-lg bg-dark-200 border border-dark-100 flex items-start gap-3">
              <Info size={18} className="text-b1t-orange flex-shrink-0 mt-0.5" />
              <div className="text-xs text-gray-400 space-y-1">
                <p className="font-semibold text-gray-300">{t('inscribe.feeInfoTitle')}</p>
                <p>{t('inscribe.feeInfoPlatform')}</p>
                <p>{t('inscribe.feeInfoMiner')}</p>
              </div>
            </div>

            {/* Inscribe Button */}
            <button
              onClick={handleInscribe}
              disabled={loading || dataTooLarge || dataSize === 0}
              className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader size={20} className="animate-spin" />
                  {progress?.message || t('inscribe.inscribing')}
                </>
              ) : (
                <>
                  <Image size={20} />
                  {t('inscribe.inscribeBtn', { size: formatBytes(dataSize) })}
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* Progress */}
        {progress && loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Loader size={20} className="animate-spin text-b1t-orange" />
                <p className="font-semibold">{progress.message}</p>
              </div>
              {progress.total > 0 && (
                <div className="h-2 bg-dark-200 rounded overflow-hidden">
                  <div
                    className="h-2 bg-b1t-orange rounded transition-all duration-500"
                    style={{ width: `${Math.round((progress.step / progress.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Result */}
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card border border-green-500/30 bg-green-900/10">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle size={24} className="text-green-400" />
                <h3 className="text-lg font-semibold text-green-400">{t('inscribe.success')}</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('inscribe.resultTxid')}:</span>
                  <span className="font-mono text-xs text-white break-all">{result.inscriptionTxid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('inscribe.resultTxCount')}:</span>
                  <span className="font-mono text-white">{result.totalTransactions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('inscribe.resultContentType')}:</span>
                  <span className="font-mono text-white">{result.contentType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('inscribe.resultDataSize')}:</span>
                  <span className="font-mono text-white">{formatBytes(result.dataSize)}</span>
                </div>
              </div>
              {result.broadcastResults && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-400 hover:text-gray-200">{t('inscribe.showAllTx')}</summary>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {result.broadcastResults.map((br, i) => (
                      <div key={i} className="flex justify-between font-mono text-gray-400">
                        <span>Tx {br.transactionNumber}</span>
                        <span className="text-gray-500 break-all ml-2">{br.txid}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </motion.div>
        )}

        {/* Hidden canvas for compression */}
        <canvas ref={canvasRef} className="hidden" />
      </motion.div>
    </div>
  );
}
