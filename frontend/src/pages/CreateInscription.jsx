import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Image, Type, Settings, DollarSign, Zap, CheckCircle, AlertCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import useWalletStore from '../store/walletStore';
import { ordinalsApi, b1t20Api } from '../services/api';

export default function CreateInscription() {
  const { isUnlocked, getCurrentAddress } = useWalletStore();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('text');
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [processingImage, setProcessingImage] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [imageMetadata, setImageMetadata] = useState(null);

  // Form states
  const [textForm, setTextForm] = useState({
    name: '',
    description: '',
    text: ''
  });

  const [imageForm, setImageForm] = useState({
    name: '',
    description: '',
    image: null,
    width: 512,
    height: 512,
    quality: 15,
    format: 'jpeg'
  });

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isUnlocked) {
      navigate('/ordinals');
      return;
    }
  }, [isUnlocked, navigate]);

  // Handle text form changes
  const handleTextChange = (field, value) => {
    setTextForm(prev => ({ ...prev, [field]: value }));

    // Update cost estimation when any field changes
    if (textForm.text.length > 0 || field === 'text') {
      const textLength = field === 'text' ? value.length : textForm.text.length;
      if (textLength > 0) {
        updateCostEstimation(textLength, 'text');
      }
    }
  };

  // Handle image file upload
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error(t('ordinals.create.invalidImage'));
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast.error(t('ordinals.create.imageTooLarge'));
      return;
    }

    setImageForm(prev => ({ ...prev, image: file }));
    setImageMetadata(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewImage(e.target.result);
    };
    reader.readAsDataURL(file);

    // Process image for preview and cost estimation
    processImagePreview(file);
  };

  // Process image preview
  const processImagePreview = async (file) => {
    try {
      setProcessingImage(true);

      const formData = new FormData();
      formData.append('image', file);
      formData.append('width', imageForm.width);
      formData.append('height', imageForm.height);
      formData.append('quality', imageForm.quality);
      formData.append('format', imageForm.format);

      const response = await ordinalsApi.processImagePreview(formData);

      if (response.success) {
        setPreviewImage(response.preview);
        setImageMetadata(response.metadata);
        updateCostEstimation(response.metadata.compressedSize, 'image');
      }
    } catch (error) {
      console.error('Failed to process image:', error);
      toast.error(t('ordinals.create.processError'));
    } finally {
      setProcessingImage(false);
    }
  };

  // Update cost estimation
  const updateCostEstimation = async (sizeBytes, type) => {
    try {
      // Get form data based on type
      const formData = type === 'text' ? textForm : imageForm;

      // Prepare parameters for B1T-20 API
      const params = {
        type,
        content: type === 'text' ? formData.text : sizeBytes.toString(), // For images, content is the size in bytes
        name: formData.name || 'Unnamed Inscription',
        description: formData.description || ''
      };

      const response = await b1t20Api.estimateB1T20Cost(params);
      if (response.success) {
        setEstimatedCost(response.estimate);
      }
    } catch (error) {
      console.error('Failed to estimate cost:', error);
    }
  };

  // Handle image settings changes
  const handleImageSettingsChange = (field, value) => {
    setImageForm(prev => ({ ...prev, [field]: value }));

    // Re-process image if we have one
    if (imageForm.image) {
      setTimeout(() => processImagePreview(imageForm.image), 500);
    }
  };

  // Create text inscription
  const handleCreateTextInscription = async () => {
    if (!textForm.name || !textForm.text) {
      toast.error(t('ordinals.create.requiredFields'));
      return;
    }

    try {
      setLoading(true);
      const currentAddr = getCurrentAddress();

      // Get mnemonic and derive private key for B1T-20 inscription
      let mnemonic;
      try { mnemonic = localStorage.getItem('b1t_mnemonic'); } catch {}
      if (!mnemonic) {
        toast.error('Wallet mnemonic not found');
        return;
      }

      // Get private key from backend
      const privateKeyResponse = await fetch('/api/wallet/get-private-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mnemonic,
          account: 0,
          addressIndex: currentAddr.index || 0
        })
      });

      if (!privateKeyResponse.ok) {
        throw new Error('Failed to get private key');
      }

      const { privateKey } = await privateKeyResponse.json();

      const response = await b1t20Api.mintTextInscription({
        address: currentAddr.address,
        name: textForm.name,
        description: textForm.description,
        text: textForm.text,
        privateKey
      });

      if (response.success) {
        toast.success(t('ordinals.create.textSuccess'));
        navigate('/ordinals');
      }
    } catch (error) {
      console.error('Failed to create text inscription:', error);
      toast.error(t('ordinals.create.textError'));
    } finally {
      setLoading(false);
    }
  };

  // Create image inscription
  const handleCreateImageInscription = async () => {
    if (!imageForm.name || !imageForm.image) {
      toast.error(t('ordinals.create.requiredFields'));
      return;
    }

    try {
      setLoading(true);
      const currentAddr = getCurrentAddress();

      // Get mnemonic and derive private key for B1T-20 inscription
      let mnemonic;
      try { mnemonic = localStorage.getItem('b1t_mnemonic'); } catch {}
      if (!mnemonic) {
        toast.error('Wallet mnemonic not found');
        return;
      }

      // Get private key from backend
      const privateKeyResponse = await fetch('/api/wallet/get-private-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mnemonic,
          account: 0,
          addressIndex: currentAddr.index || 0
        })
      });

      if (!privateKeyResponse.ok) {
        throw new Error('Failed to get private key');
      }

      const { privateKey } = await privateKeyResponse.json();

      const formData = new FormData();
      formData.append('address', currentAddr.address);
      formData.append('name', imageForm.name);
      formData.append('description', imageForm.description);
      formData.append('image', imageForm.image);
      formData.append('width', imageForm.width);
      formData.append('height', imageForm.height);
      formData.append('quality', imageForm.quality);
      formData.append('format', imageForm.format);
      formData.append('privateKey', privateKey);

      const response = await b1t20Api.mintImageInscription(formData);

      if (response.success) {
        toast.success(t('ordinals.create.imageSuccess'));
        navigate('/ordinals');
      }
    } catch (error) {
      console.error('Failed to create image inscription:', error);
      toast.error(t('ordinals.create.imageError'));
    } finally {
      setLoading(false);
    }
  };

  if (!isUnlocked) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center space-x-4">
          <Link
            to="/ordinals"
            className="p-2 rounded-lg hover:bg-dark-200 transition"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-4xl font-bold glow-text">{t('ordinals.create.title')}</h1>
            <p className="text-gray-400">{t('ordinals.create.subtitle')}</p>
          </div>
        </div>
      </motion.div>

      {/* Tab Selection */}
      <div className="card">
        <div className="flex space-x-4 border-b border-dark-300">
          <button
            onClick={() => setActiveTab('text')}
            className={`pb-4 px-2 flex items-center space-x-2 border-b-2 transition ${
              activeTab === 'text'
                ? 'border-b1t-orange text-b1t-orange'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Type size={20} />
            <span>{t('ordinals.create.textTab')}</span>
          </button>
          <button
            onClick={() => setActiveTab('image')}
            className={`pb-4 px-2 flex items-center space-x-2 border-b-2 transition ${
              activeTab === 'image'
                ? 'border-b1t-orange text-b1t-orange'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Image size={20} />
            <span>{t('ordinals.create.imageTab')}</span>
          </button>
        </div>
      </div>

      {/* Cost Estimation */}
      {estimatedCost && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card bg-gradient-orange/10 border-orange-500/50"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <DollarSign className="text-b1t-orange" size={24} />
              <div>
                <h3 className="font-semibold">{t('ordinals.create.estimatedCost')}</h3>
                <p className="text-sm text-gray-400">
                  {t('ordinals.create.estimatedTxs')}: {estimatedCost.estimatedTxs}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-b1t-orange">
                {estimatedCost.feeInB1T.toFixed(8)} B1T
              </p>
              <p className="text-xs text-gray-400">
                ~{estimatedCost.estimatedSize} bytes
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Text Inscription Form */}
      {activeTab === 'text' && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card space-y-6"
        >
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('ordinals.create.name')} *
            </label>
            <input
              type="text"
              value={textForm.name}
              onChange={(e) => handleTextChange('name', e.target.value)}
              className="w-full px-4 py-3 bg-dark-200 border border-dark-300 rounded-lg focus:outline-none focus:border-b1t-orange text-white"
              placeholder={t('ordinals.create.namePlaceholder')}
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              {t('ordinals.create.description')}
            </label>
            <textarea
              value={textForm.description}
              onChange={(e) => handleTextChange('description', e.target.value)}
              className="w-full px-4 py-3 bg-dark-200 border border-dark-300 rounded-lg focus:outline-none focus:border-b1t-orange text-white resize-none"
              placeholder={t('ordinals.create.descriptionPlaceholder')}
              rows={3}
              maxLength={500}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              {t('ordinals.create.textContent')} *
            </label>
            <textarea
              value={textForm.text}
              onChange={(e) => handleTextChange('text', e.target.value)}
              className="w-full px-4 py-3 bg-dark-200 border border-dark-300 rounded-lg focus:outline-none focus:border-b1t-orange text-white resize-none font-mono text-sm"
              placeholder={t('ordinals.create.textContentPlaceholder')}
              rows={6}
              maxLength={1000}
            />
            <div className="text-xs text-gray-400 mt-1">
              {textForm.text.length}/1000 {t('ordinals.create.characters')}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCreateTextInscription}
              disabled={loading || !textForm.name || !textForm.text}
              className="btn-primary"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  {t('ordinals.create.creating')}
                </>
              ) : (
                <>
                  <Zap size={20} className="mr-2" />
                  {t('ordinals.create.createText')}
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Image Inscription Form */}
      {activeTab === 'image' && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          <div className="grid md:grid-cols-2 gap-6">
            {/* Upload Section */}
            <div className="card space-y-4">
              <h3 className="font-semibold flex items-center">
                <Upload size={20} className="mr-2" />
                {t('ordinals.create.uploadImage')}
              </h3>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-dark-300 rounded-lg p-8 text-center cursor-pointer hover:border-b1t-orange transition"
              >
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="w-full h-48 object-contain mx-auto"
                  />
                ) : (
                  <div className="space-y-4">
                    <Image size={48} className="mx-auto text-gray-400" />
                    <div>
                      <p className="text-white">{t('ordinals.create.dropImage')}</p>
                      <p className="text-sm text-gray-400">{t('ordinals.create.orClick')}</p>
                    </div>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              {imageForm.image && (
                <div className="flex items-center justify-between p-3 bg-dark-200 rounded-lg">
                  <span className="text-sm truncate">{imageForm.image.name}</span>
                  <button
                    onClick={() => {
                      setImageForm(prev => ({ ...prev, image: null }));
                      setPreviewImage(null);
                      setEstimatedCost(null);
                    }}
                    className="p-1 rounded hover:bg-dark-300 transition"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {processingImage && (
                <div className="flex items-center space-x-2 p-3 bg-dark-200 rounded-lg">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-b1t-orange"></div>
                  <span className="text-sm">{t('ordinals.create.processing')}</span>
                </div>
              )}
            </div>

            {/* Settings Section */}
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center">
                  <Settings size={20} className="mr-2" />
                  {t('ordinals.create.settings')}
                </h3>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-sm text-b1t-orange hover:text-b1t-orange-400"
                >
                  {showAdvanced ? t('ordinals.create.simple') : t('ordinals.create.advanced')}
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  {t('ordinals.create.name')} *
                </label>
                <input
                  type="text"
                  value={imageForm.name}
                  onChange={(e) => {
                  setImageForm(prev => ({ ...prev, name: e.target.value }));
                  // Update cost estimation if image is loaded
                  if (imageMetadata) {
                    updateCostEstimation(imageMetadata.compressedSize, 'image');
                  }
                }}
                  className="w-full px-4 py-3 bg-dark-200 border border-dark-300 rounded-lg focus:outline-none focus:border-b1t-orange text-white"
                  placeholder={t('ordinals.create.namePlaceholder')}
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  {t('ordinals.create.description')}
                </label>
                <textarea
                  value={imageForm.description}
                  onChange={(e) => {
                    setImageForm(prev => ({ ...prev, description: e.target.value }));
                    // Update cost estimation if image is loaded
                    if (imageMetadata) {
                      updateCostEstimation(imageMetadata.compressedSize, 'image');
                    }
                  }}
                  className="w-full px-4 py-3 bg-dark-200 border border-dark-300 rounded-lg focus:outline-none focus:border-b1t-orange text-white resize-none"
                  placeholder={t('ordinals.create.descriptionPlaceholder')}
                  rows={2}
                  maxLength={500}
                />
              </div>

              {showAdvanced && (
                <div className="space-y-4 pt-4 border-t border-dark-300">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        {t('ordinals.create.width')}
                      </label>
                      <input
                        type="number"
                        value={imageForm.width}
                        onChange={(e) => handleImageSettingsChange('width', parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-dark-200 border border-dark-300 rounded-lg focus:outline-none focus:border-b1t-orange text-white"
                        min={32}
                        max={2048}
                        step={32}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        {t('ordinals.create.height')}
                      </label>
                      <input
                        type="number"
                        value={imageForm.height}
                        onChange={(e) => handleImageSettingsChange('height', parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-dark-200 border border-dark-300 rounded-lg focus:outline-none focus:border-b1t-orange text-white"
                        min={32}
                        max={2048}
                        step={32}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      {t('ordinals.create.quality')}: {imageForm.quality}%
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={imageForm.quality}
                      onChange={(e) => handleImageSettingsChange('quality', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      {t('ordinals.create.format')}
                    </label>
                    <select
                      value={imageForm.format}
                      onChange={(e) => handleImageSettingsChange('format', e.target.value)}
                      className="w-full px-3 py-2 bg-dark-200 border border-dark-300 rounded-lg focus:outline-none focus:border-b1t-orange text-white"
                    >
                      <option value="jpeg">JPEG</option>
                      <option value="png">PNG</option>
                      <option value="webp">WebP</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-sm text-gray-400">
                <AlertCircle size={16} />
                <p>{t('ordinals.create.twoStepProcess')}</p>
              </div>

              {imageForm.image && (
                <div className="bg-dark-200 rounded-lg p-3">
                  <h4 className="font-medium mb-2">{t('ordinals.create.fileInfo')}</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">{t('ordinals.create.originalSize')}:</span>
                      <span>{(imageForm.image.size / 1024).toFixed(2)} KB</span>
                    </div>
                    {imageMetadata && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-400">{t('ordinals.create.processedSize')}:</span>
                          <span>{(imageMetadata.compressedSize / 1024).toFixed(2)} KB</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">{t('ordinals.create.compression')}:</span>
                          <span>{imageMetadata.compressionRatio}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">{t('ordinals.create.dimensions')}:</span>
                          <span>{imageMetadata.finalWidth}x{imageMetadata.finalHeight}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCreateImageInscription}
              disabled={loading || !imageForm.name || !imageForm.image || processingImage}
              className="btn-primary"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  {t('ordinals.create.creating')}
                </>
              ) : (
                <>
                  <Zap size={20} className="mr-2" />
                  {t('ordinals.create.createImage')}
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}