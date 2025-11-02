import React, { useState, useCallback } from 'react';
import { b1t20Api } from '../services/api';

const B1T20Mint = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [status, setStatus] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    mnemonic: '',
    recipientAddress: 'B8p3qXwNTXwPAtVceexqhg8M27ZN8mZ5cc', // Pre-filled with known address
    ticker: 'RABBIT',
    maxSupply: '1000000',
    mintAmount: '1',
    limit: '1000',
    name: 'Rabb1T',
    description: 'First Ordinal on B1T by OnlyPW',
    image: null
  });

  // Load service status on component mount
  React.useEffect(() => {
    const loadStatus = async () => {
      try {
        const statusData = await b1t20Api.getStatus();
        setStatus(statusData);
      } catch (err) {
        console.error('Failed to load B1T-20 service status:', err);
      }
    };
    loadStatus();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file size (max 3600 bytes for B1T)
      if (file.size > 3600) {
        setError('Image file must be smaller than 3600 bytes for B1T network');
        return;
      }

      setFormData(prev => ({
        ...prev,
        image: file
      }));

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (!formData.mnemonic.trim()) {
        throw new Error('Mnemonic phrase is required');
      }

      if (!formData.ticker.trim()) {
        throw new Error('Token ticker is required');
      }

      const mintData = {
        mnemonic: formData.mnemonic.trim(),
        recipientAddress: formData.recipientAddress.trim(),
        ticker: formData.ticker.trim(),
        maxSupply: formData.maxSupply || '1000000',
        mintAmount: formData.mintAmount || '1',
        limit: formData.limit || '1000',
        name: formData.name || formData.ticker.toUpperCase(),
        description: formData.description || '',
      };

      let response;

      if (formData.image) {
        // If image provided, use FormData for file upload
        const formDataToSend = new FormData();
        Object.keys(mintData).forEach(key => {
          formDataToSend.append(key, mintData[key]);
        });
        formDataToSend.append('image', formData.image);

        response = await b1t20Api.mintImageInscription(formDataToSend);
      } else {
        // Text-only minting
        response = await b1t20Api.mintTextInscription(mintData);
      }

      setResult(response);
      console.log('B1T-20 Minting successful:', response);

    } catch (err) {
      setError(err.message || 'Minting failed');
      console.error('B1T-20 minting error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEstimate = async () => {
    if (!formData.mnemonic.trim() || !formData.ticker.trim()) {
      setError('Mnemonic and ticker are required for estimation');
      return;
    }

    try {
      setLoading(true);
      const estimateData = {
        mnemonic: formData.mnemonic.trim(),
        recipientAddress: formData.recipientAddress.trim(),
        ticker: formData.ticker.trim(),
        maxSupply: formData.maxSupply || '1000000',
        mintAmount: formData.mintAmount || '1',
        limit: formData.limit || '1000',
        hasImage: !!formData.image
      };

      const estimate = await b1t20Api.estimateB1T20Cost(estimateData);
      setResult({ type: 'estimate', data: estimate });

    } catch (err) {
      setError(err.message || 'Estimation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">B1T-20 Token Minting</h1>
        <p className="text-lg text-gray-600">Complete B1T-20 Ordinals with Image & Metadata</p>
      </div>

      {/* Service Status */}
      {status && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <h3 className="font-semibold text-green-800">B1T-20 Service Active</h3>
          </div>
          <div className="mt-2 text-sm text-green-700">
            <div>Service: {status.b1t20Service?.type || 'Unknown'}</div>
            <div>RPC Status: {status.rpc?.success ? 'Connected' : 'Disconnected'}</div>
            {status.rpc?.success && (
              <div>Chain: {status.rpc.data?.chain} | Block: {status.rpc.data?.blocks}</div>
            )}
          </div>
        </div>
      )}

      {/* Main Form */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <h2 className="text-2xl font-bold">Create B1T-20 Token</h2>
          <p className="mt-2 opacity-90">Deploy and mint your B1T-20 token with optional image</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Mnemonic Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mnemonic Phrase *
            </label>
            <textarea
              name="mnemonic"
              value={formData.mnemonic}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="Enter your 12-word mnemonic phrase..."
              required
            />
          </div>

          {/* Token Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipient Address
              </label>
              <input
                type="text"
                name="recipientAddress"
                value={formData.recipientAddress}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="B1T address..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Token Ticker *
              </label>
              <input
                type="text"
                name="ticker"
                value={formData.ticker}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. RABBIT"
                maxLength={10}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Supply
              </label>
              <input
                type="text"
                name="maxSupply"
                value={formData.maxSupply}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. 1000000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mint Amount
              </label>
              <input
                type="text"
                name="mintAmount"
                value={formData.mintAmount}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. 1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Limit per TX
              </label>
              <input
                type="text"
                name="limit"
                value={formData.limit}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. 1000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Token Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. Rabb1T"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="Describe your token..."
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Token Image (Optional - Max 3600 bytes)
            </label>
            <div className="space-y-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />

              {imagePreview && (
                <div className="mt-4">
                  <p className="text-sm text-gray-600 mb-2">Image Preview:</p>
                  <img
                    src={imagePreview}
                    alt="Token preview"
                    className="h-32 w-32 object-cover rounded-lg border border-gray-300"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Size: {formData.image?.size} bytes
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Processing...' : '🚀 Deploy & Mint B1T-20 Token'}
            </button>

            <button
              type="button"
              onClick={handleEstimate}
              disabled={loading}
              className="bg-gray-600 text-white py-3 px-6 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              💰 Estimate Cost
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="font-semibold text-red-800 mb-2">❌ Error</h3>
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="font-semibold text-green-800 mb-4">
            {result.type === 'estimate' ? '💰 Cost Estimate' : '🎉 B1T-20 Token Created Successfully!'}
          </h3>

          <div className="space-y-3">
            {result.type === 'estimate' ? (
              <div className="text-green-700">
                <div>Estimated Fee: {result.data?.estimatedFee} satoshis</div>
                <div>Transaction Count: {result.data?.transactionCount || 1}</div>
                <div>Estimated Size: {result.data?.estimatedSize} bytes</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-green-700">
                  <strong>Token Details:</strong>
                </div>
                <div>Token: {result.token?.ticker || formData.ticker.toUpperCase()}</div>
                <div>Name: {result.token?.name || formData.name}</div>
                <div>Max Supply: {result.token?.maxSupply || formData.maxSupply}</div>
                <div>Description: {result.token?.description || formData.description}</div>

                {result.transactions && (
                  <div className="mt-4">
                    <strong>Transactions:</strong>
                    {result.transactions.map((tx, i) => (
                      <div key={i} className="mt-2 p-3 bg-white rounded border border-green-200">
                        <div className="font-medium">{tx.type}</div>
                        <div className="text-sm text-gray-600">TXID: {tx.txid}</div>
                        <div className="text-sm text-gray-600">{tx.description}</div>
                      </div>
                    ))}
                  </div>
                )}

                {result.txid && (
                  <div className="mt-4">
                    <strong>Transaction ID:</strong>
                    <div className="font-mono text-sm bg-white p-2 rounded border">{result.txid}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default B1T20Mint;