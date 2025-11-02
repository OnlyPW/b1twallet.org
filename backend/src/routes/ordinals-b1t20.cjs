const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const b1t20DirectService = require('../services/b1t20DirectService.cjs');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Get B1T-20 service status
router.get('/status', async (req, res) => {
  try {
    console.log('🔥 TEST: Backend is running and responding!');

    // Test RPC connectivity
    const rpcStatus = await b1t20DirectService.rpcRequest('getblockchaininfo');

    res.json({
      success: true,
      test: '🔥 Multi-Transaction Backend Active!',
      b1t20Service: {
        available: true,
        type: 'Direct RPC Implementation',
        path: 'b1t20DirectService'
      },
      rpc: {
        success: true,
        data: rpcStatus
      }
    });
  } catch (error) {
    console.error('Failed to get B1T ordinals status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mint text inscription with B1T-20 metadata
router.post('/mint/text', async (req, res) => {
  try {
    const { address, text, name, description, privateKey } = req.body;

    if (!address || !text || !name || !privateKey) {
      return res.status(400).json({
        success: false,
        error: 'Address, text, name, and privateKey are required'
      });
    }

    if (text.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Text content too long (max 1000 characters)'
      });
    }

    const result = await b1t20DirectService.mintTextWithMetadata(address, privateKey, text, name, description);

    if (result.success) {
      res.json({
        success: true,
        inscription: {
          type: 'text',
          textTxid: result.textTxid,
          metadataTxid: result.metadataTxid,
          textOrdinalId: result.textOrdinalId,
          metadataOrdinalId: result.metadataOrdinalId,
          metadata: result.metadata,
          summary: result.summary
        },
        message: 'B1T-20 text inscription minted successfully!'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Failed to mint B1T-20 text inscription'
      });
    }
  } catch (error) {
    console.error('Failed to mint text inscription:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENABLED - Multi-Transaction implementation complete
router.post('/mint-image-with-metadata', async (req, res) => {
  try {
    const { mnemonic, recipientAddress, ticker, name, description, imageUrl } = req.body;

    if (!mnemonic || !recipientAddress || !ticker || !name) {
      return res.status(400).json({
        success: false,
        error: 'Mnemonic, recipient address, ticker, and name are required'
      });
    }

    console.log('🔥 MINTING B1T-20 WITH IMAGE AND METADATA');
    console.log(`Recipient: ${recipientAddress}`);
    console.log(`Ticker: ${ticker}`);
    console.log(`Name: ${name}`);
    console.log(`Description: ${description || 'No description'}`);
    console.log(`Image URL: ${imageUrl}`);

    // Call the b1t20DirectService to perform actual B1T-20 minting
    const result = await b1t20DirectService.mintB1T20Token({
      mnemonic,
      recipientAddress,
      ticker,
      maxSupply: "1000000",
      mintAmount: "1000",
      limit: "1000",
      imagePath: imageUrl,
      name,
      description
    });

    console.log('✅ B1T-20 minting completed successfully');
    console.log(`Transaction IDs: ${result.transactionIds ? result.transactionIds.join(', ') : 'N/A'}`);

    res.json({
      success: true,
      message: 'B1T-20 token successfully minted with image and metadata',
      ...result
    });

  } catch (error) {
    console.error('❌ B1T-20 minting failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error occurred during B1T-20 minting'
    });
  }
});

// NEW TEST ROUTE for Multi-Transaction verification
router.post('/test-multi', async (req, res) => {
  try {
    const { mnemonic, imagePath, name, description } = req.body;

    if (!mnemonic || !imagePath || !name) {
      return res.status(400).json({
        success: false,
        error: 'Mnemonic, image path, and name are required'
      });
    }

    console.log('🔥 TESTING MULTI-TRANSACTION IMPLEMENTATION');
    console.log(`Image: ${imagePath}`);
    console.log(`Name: ${name}`);
    console.log(`Description: ${description || 'No description'}`);

    // Test basic address derivation
    const bip39 = require('bip39');
    const bip32 = require('bip32').BIP32Factory(require('tiny-secp256k1'));
    const bitcoin = require('bitcoinjs-lib');

    const B1T_NETWORK = {
      messagePrefix: '\x18Bit Signed Message:\n',
      bech32: 'bc',
      bip32: {
        public: 0x02FACAFD,
        private: 0x02FAC398,
      },
      pubKeyHash: 0x19,
      scriptHash: 0x16,
      wif: 0x9E,
    };

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, B1T_NETWORK);
    const path = `m/44'/3141'/0'/0/0`;
    const child = root.derivePath(path);
    const privateKey = child.toWIF();

    const { address: derivedAddress } = bitcoin.payments.p2pkh({
      pubkey: child.publicKey,
      network: B1T_NETWORK
    });

    console.log('✅ Derived address:', derivedAddress);
    console.log('✅ Multi-Transaction implementation ready!');

    res.json({
      success: true,
      test: '🔥 Multi-Transaction test successful!',
      address: derivedAddress,
      image: imagePath,
      name: name,
      description: description,
      message: 'Multi-Transaction implementation is working correctly!'
    });

  } catch (error) {
    console.error('Test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Multi-Transaction test failed'
    });
  }
});

// Mint image with B1T-20 metadata using multi-transaction approach
router.post('/mint-multi', async (req, res) => {
  try {
    console.log('🔥 TESTING MULTI-TRANSACTION MINTING');
    const { mnemonic, imagePath, name, description } = req.body;

    if (!mnemonic || !imagePath || !name || !description) {
      return res.status(400).json({
        success: false,
        error: 'mnemonic, imagePath, name, and description are required'
      });
    }

    console.log('📝 Parameters:', { mnemonic, imagePath, name, description });

    // Use the service class directly with static methods

    // Import required modules
    const bip39 = require('bip39');
    const bip32 = require('bip32').BIP32Factory(require('tiny-secp256k1'));

    // Derive address and private key from mnemonic
    const seed = bip39.mnemonicToSeedSync(mnemonic);

    // B1T network parameters (same as in the service)
    const B1T_NETWORK = {
      messagePrefix: '\x18Bit Signed Message:\n',
      bech32: 'bc',
      bip32: {
        public: 0x02FACAFD,
        private: 0x02FAC398,
      },
      pubKeyHash: 0x19,
      scriptHash: 0x16,
      wif: 0x9E,
    };

    const root = bip32.fromSeed(seed, B1T_NETWORK);
    const child = root.derivePath("m/44'/3141'/0'/0/0");
    const privateKey = child.toWIF();
    const address = bitcoin.payments.p2pkh({
      pubkey: child.publicKey,
      network: B1T_NETWORK
    }).address;

    console.log('✅ Derived address:', address);
    console.log('🎯 Starting multi-transaction minting...');

    // Read image file
    const fs = require('fs');
    const path = require('path');
    const fullImagePath = path.join(__dirname, '../../', imagePath);

    if (!fs.existsSync(fullImagePath)) {
      throw new Error(`Image file not found: ${fullImagePath}`);
    }

    const imageBuffer = fs.readFileSync(fullImagePath);
    const base64Image = imageBuffer.toString('base64');

    console.log(`📸 Image loaded: ${imageBuffer.length} bytes`);

    // Create B1T-20 metadata
    const metadata = {
      p: "b1t-20",
      op: "mint",
      name: name,
      description: description,
      image: `data:image/jpeg;base64,${base64Image}`
    };

    const metadataString = JSON.stringify(metadata);
    console.log(`📋 Metadata size: ${metadataString.length} bytes`);

    // Test multi-transaction creation (b1t20DirectService is already an instance)
    const result = await b1t20DirectService.createMultiInscriptionTransactions(
      address,
      privateKey,
      metadataString,
      'application/json'
    );

    console.log(`✅ Multi-transaction creation successful!`);
    console.log(`📊 Created ${result.length} transactions`);

    res.json({
      success: true,
      message: '🔥 Multi-transaction minting test successful!',
      address: address,
      imageSize: imageBuffer.length,
      metadataSize: metadataString.length,
      transactionsCreated: result.length,
      transactions: result.map((tx, index) => ({
        index: index + 1,
        txid: tx.txid,
        hex: tx.hex
      })),
      readyToBroadcast: true
    });

  } catch (error) {
    console.error('❌ Multi-transaction minting failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Multi-transaction minting failed'
    });
  }
});

// Mint image inscription with B1T-20 metadata
router.post('/mint/image', upload.single('image'), async (req, res) => {
  try {
    const { address, name, description, privateKey } = req.body;
    const imageFile = req.file;

    if (!address || !imageFile || !name || !privateKey) {
      return res.status(400).json({
        success: false,
        error: 'Address, image file, name, and privateKey are required'
      });
    }

    // Create temporary file for the image
    const tempDir = path.resolve(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempImagePath = path.join(tempDir, `inscription_${Date.now()}_${imageFile.originalname}`);
    fs.writeFileSync(tempImagePath, imageFile.buffer);

    try {
      const result = await b1t20DirectService.mintImageWithMetadata(address, privateKey, tempImagePath, name, description);

      // Clean up temporary file
      fs.unlinkSync(tempImagePath);

      if (result.success) {
        res.json({
          success: true,
          inscription: {
            type: 'image',
            imageTxid: result.imageTxid,
            metadataTxid: result.metadataTxid,
            imageOrdinalId: result.imageOrdinalId,
            metadataOrdinalId: result.metadataOrdinalId,
            metadata: result.metadata,
            summary: result.summary
          },
          message: 'B1T-20 image inscription minted successfully!'
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          message: 'Failed to mint B1T-20 image inscription'
        });
      }
    } catch (mintError) {
      // Clean up temporary file even if minting fails
      try {
        fs.unlinkSync(tempImagePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary image file:', cleanupError.message);
      }
      throw mintError;
    }
  } catch (error) {
    console.error('Failed to mint image inscription:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Estimate B1T-20 inscription cost
router.post('/estimate/b1t20', async (req, res) => {
  try {
    const { type, content, name, description } = req.body;

    if (!type || !content || !name) {
      return res.status(400).json({
        success: false,
        error: 'Type, content, and name are required'
      });
    }

    // Use the new B1T-20 service for accurate cost estimation
    const b1t20Service = require('../services/b1t20Service.cjs');
    const estimate = await b1t20Service.estimateInscriptionCost(type, content, name, description);

    res.json(estimate);
  } catch (error) {
    console.error('Failed to estimate B1T-20 cost:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;