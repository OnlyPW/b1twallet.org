import express from 'express';
import multer from 'multer';
import sharp from 'sharp';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Get inscriptions for an address - try to get real data, fallback to empty
router.get('/inscriptions/:address', async (req, res) => {
  try {
    const { address } = req.params;

    // Simple validation
    if (!address || address.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format'
      });
    }

    // Try to get real UTXOs for inscriptions
    let utxos = [];
    let inscriptions = [];
    let ordinals = [];

    try {
      // Import rpcClient dynamically to avoid errors if RPC is not available
      const { default: rpcClient } = await import('../services/rpcClient.js');

      // Get UTXOs for the address
      utxos = await rpcClient.getAddressUtxos(address);
      console.log(`Found ${utxos.length} UTXOs for address ${address}`);

      // Check each UTXO for inscriptions (simplified detection)
      for (const utxo of utxos) {
        try {
          const tx = await rpcClient.getRawTransaction(utxo.txid, true);

          if (tx.vout[utxo.outputIndex] && tx.vout[utxo.outputIndex].scriptPubKey) {
            const scriptPubKey = tx.vout[utxo.outputIndex].scriptPubKey;

            // Look for Ordinal pattern in script (simplified detection)
            if (scriptPubKey.asm && (scriptPubKey.asm.includes('OP_RETURN') || scriptPubKey.asm.length > 200)) {
              const ordinalData = {
                id: `${utxo.txid}i${utxo.outputIndex}`,
                txid: utxo.txid,
                outputIndex: utxo.outputIndex,
                address: address,
                satoshis: utxo.satoshis,
                contentType: 'text/plain',
                createdAt: tx.time || Date.now(),
                confirmations: tx.confirmations || 0
              };

              ordinals.push(ordinalData);
              inscriptions.push({
                ...ordinalData,
                content: 'Ordinal inscription detected',
                type: 'ordinal'
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to check UTXO ${utxo.txid}:${utxo.outputIndex}:`, error.message);
        }
      }
    } catch (rpcError) {
      console.log('RPC not available for inscriptions detection, returning empty collections');
      // RPC not available, continue with empty collections
    }

    res.json({
      success: true,
      inscriptions,
      ordinals,
      total: ordinals.length,
      utxosFound: utxos.length,
      message: ordinals.length === 0
        ? 'No inscriptions found. Use Create Inscription to mint your first B1T ordinal.'
        : `Found ${ordinals.length} inscription(s) for this address.`
    });
  } catch (error) {
    console.error('Failed to get inscriptions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Process image preview - works without RPC
router.post('/process-image', upload.single('image'), async (req, res) => {
  try {
    const imageFile = req.file;

    if (!imageFile) {
      return res.status(400).json({
        success: false,
        error: 'Image file is required'
      });
    }

    const options = {
      width: parseInt(req.body.width) || 512,
      height: parseInt(req.body.height) || 512,
      quality: parseInt(req.body.quality) || 15,
      format: req.body.format || 'jpeg'
    };

    const processed = await processImage(imageFile.buffer, options);

    // Convert processed buffer to base64 for preview
    const previewBase64 = `data:image/${processed.format};base64,${processed.buffer.toString('base64')}`;

    res.json({
      success: true,
      preview: previewBase64,
      metadata: processed
    });
  } catch (error) {
    console.error('Failed to process image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Estimate inscription cost - use real fee rates from RPC
router.post('/estimate', async (req, res) => {
  try {
    const { sizeBytes, type } = req.body;

    if (!sizeBytes || !type) {
      return res.status(400).json({
        success: false,
        error: 'Size and type are required'
      });
    }

    let satoshiPerByte = 1; // Default fallback
    let estimatedTxs = 1;
    let estimatedSize = sizeBytes;

    // Try to get real fee rates from RPC
    try {
      const { default: rpcClient } = await import('../services/rpcClient.js');
      const feeInfo = await rpcClient.call('estimatesmartfee', [6]);
      satoshiPerByte = Math.ceil(feeInfo.feerate * 100000 / 1000); // Convert to sat/byte
      satoshiPerByte = Math.max(1, satoshiPerByte); // Minimum 1 sat/byte
      console.log(`Real fee rate: ${satoshiPerByte} sat/byte`);
    } catch (rpcError) {
      console.log('Could not get real fee rates, using fallback');
      satoshiPerByte = 1; // Fallback rate
    }

    if (type === 'image') {
      estimatedTxs = 2; // Image + metadata
      estimatedSize = sizeBytes + 500; // Add metadata size
    }

    const estimatedFee = estimatedSize * satoshiPerByte * estimatedTxs;

    res.json({
      success: true,
      estimate: {
        estimatedTxs,
        estimatedFee,
        estimatedSize,
        feeInB1T: estimatedFee / 100000000,
        satoshiPerByte,
        note: satoshiPerByte === 1 ? 'Using fallback fee rate' : 'Using real RPC fee rate'
      }
    });
  } catch (error) {
    console.error('Failed to estimate cost:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create text inscription - placeholder
router.post('/create/text', async (req, res) => {
  try {
    const { address, text, name, description } = req.body;

    if (!address || !text) {
      return res.status(400).json({
        success: false,
        error: 'Address and text are required'
      });
    }

    if (address.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format'
      });
    }

    res.json({
      success: false,
      error: 'Inscription creation not yet available',
      message: 'B1T RPC integration coming soon. Please use the command-line tool for now.',
      phase: 'Phase 3 - Coming Soon',
      placeholder: {
        address,
        name,
        description,
        textLength: text.length,
        estimatedTxs: 1
      }
    });
  } catch (error) {
    console.error('Failed to create text inscription:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create image inscription - placeholder with preview
router.post('/create/image', upload.single('image'), async (req, res) => {
  try {
    const { address, name, description } = req.body;
    const imageFile = req.file;

    if (!address || !imageFile || !name) {
      return res.status(400).json({
        success: false,
        error: 'Address, image file, and name are required'
      });
    }

    if (address.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format'
      });
    }

    // Process image preview
    const options = {
      width: parseInt(req.body.width) || 512,
      height: parseInt(req.body.height) || 512,
      quality: parseInt(req.body.quality) || 15,
      format: req.body.format || 'jpeg'
    };

    const processed = await processImage(imageFile.buffer, options);
    const previewBase64 = `data:image/${processed.format};base64,${processed.buffer.toString('base64')}`;

    res.json({
      success: false,
      error: 'Inscription creation not yet available',
      message: 'B1T RPC integration coming soon. Please use the command-line tool for now.',
      phase: 'Phase 3 - Coming Soon',
      preview: previewBase64,
      metadata: processed,
      placeholder: {
        address,
        name,
        description,
        fileSize: imageFile.size,
        processedSize: processed.compressedSize,
        compressionRatio: processed.compressionRatio,
        estimatedTxs: 2
      }
    });
  } catch (error) {
    console.error('Failed to create image inscription:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to process image
async function processImage(inputBuffer, options = {}) {
  const {
    width = 512,
    height = 512,
    quality = 15,
    format = 'jpeg'
  } = options;

  try {
    let image = sharp(inputBuffer);
    const metadata = await image.metadata();

    const targetWidth = Math.min(width, metadata.width || width);
    const targetHeight = Math.min(height, metadata.height || height);

    image = image.resize(targetWidth, targetHeight, {
      fit: 'inside',
      withoutEnlargement: true,
      fastShrinkOnLoad: true
    });

    let processedBuffer;
    if (format === 'png') {
      processedBuffer = await image.png({
        quality: Math.min(quality, 90),
        compressionLevel: 8,
        adaptiveFiltering: false
      }).toBuffer();
    } else if (format === 'webp') {
      processedBuffer = await image.webp({
        quality: Math.min(quality, 90),
        effort: 4
      }).toBuffer();
    } else {
      processedBuffer = await image.jpeg({
        quality: Math.min(quality, 90),
        progressive: true,
        optimizeScans: true
      }).toBuffer();
    }

    const processedMetadata = await sharp(processedBuffer).metadata();

    return {
      buffer: processedBuffer,
      originalSize: inputBuffer.length,
      compressedSize: processedBuffer.length,
      compressionRatio: Math.max(0, ((inputBuffer.length - processedBuffer.length) / inputBuffer.length * 100)).toFixed(2),
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      finalWidth: processedMetadata.width,
      finalHeight: processedMetadata.height,
      format: processedMetadata.format
    };
  } catch (error) {
    console.error('Failed to process image:', error);
    throw error;
  }
}

export default router;