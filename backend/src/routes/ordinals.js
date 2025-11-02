import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import multer from 'multer';
import ordinalsService from '../services/ordinalsService.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for better performance
  },
  fileFilter: (req, file, cb) => {
    // Accept common image formats
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Path to B1T ordinals tool
const ORDINALS_PATH = path.join(process.cwd(), '..', 'Extern', 'fork-B1T-ordinals-BIT-20-inscription', 'b1t-ordinals.js');
const WALLET_PATH = path.join(process.cwd(), '..', 'Extern', 'fork-B1T-ordinals-BIT-20-inscription', '.wallet.json');

// Get inscriptions for an address
router.get('/inscriptions/:address', async (req, res) => {
  try {
    const { address } = req.params;

    // Simple address validation (format check)
    if (!address || address.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format'
      });
    }

    console.log('Fetching inscriptions for address:', address);

    // Return empty collections for now - this is Phase 2 placeholder
    // In Phase 3, this will integrate with actual inscription detection
    const inscriptions = [];
    const ordinals = [];

    // TODO: Implement actual inscription detection when RPC is properly configured
    // For now, return empty collections to show the UI works

    res.json({
      success: true,
      inscriptions,
      ordinals,
      total: 0,
      message: 'No inscriptions found. Use Create Inscription to mint your first B1T ordinal.',
      debug: {
        address,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Failed to get inscriptions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      debug: {
        address: req.params.address,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Get ordinal details
router.get('/ordinal/:ordinalId', async (req, res) => {
  try {
    const { ordinalId } = req.params;

    // Parse ordinal ID (format: txidioutputIndex)
    const [txid, outputPart] = ordinalId.split('i');
    const outputIndex = parseInt(outputPart);

    if (!txid || isNaN(outputIndex)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ordinal ID format'
      });
    }

    // Get transaction details
    const tx = await rpcClient.getRawTransaction(txid, true);

    if (!tx.vout[outputIndex]) {
      return res.status(404).json({
        success: false,
        error: 'Ordinal output not found'
      });
    }

    // Extract ordinal data (simplified)
    const ordinal = {
      id: ordinalId,
      txid: txid,
      outputIndex: outputIndex,
      satoshis: tx.vout[outputIndex].value * 100000000,
      scriptPubKey: tx.vout[outputIndex].scriptPubKey,
      createdAt: tx.time || Date.now(),
      confirmations: tx.confirmations || 0,
      blockHash: tx.blockhash,
      blockHeight: tx.height
    };

    res.json({
      success: true,
      ordinal
    });
  } catch (error) {
    console.error('Failed to get ordinal:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create text inscription
router.post('/create/text', async (req, res) => {
  try {
    const { address, text, name, description } = req.body;

    if (!address || !text) {
      return res.status(400).json({
        success: false,
        error: 'Address and text are required'
      });
    }

    // Simple address format validation
    if (address.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format'
      });
    }

    // Return placeholder response for now
    // TODO: Implement actual inscription creation when RPC is properly configured
    res.json({
      success: false,
      error: 'Inscription creation not yet available',
      message: 'B1T RPC integration coming soon. Please use the command-line tool for now.',
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

// Create image inscription with metadata
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

    // Simple address format validation
    if (address.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format'
      });
    }

    // Process image preview (this works without RPC)
    const options = {
      width: parseInt(req.body.width) || 512,
      height: parseInt(req.body.height) || 512,
      quality: parseInt(req.body.quality) || 80,
      format: req.body.format || 'jpeg'
    };

    const processed = await ordinalsService.processImage(imageFile.buffer, options);

    // Convert processed buffer to base64 for preview
    const previewBase64 = `data:image/${processed.format};base64,${processed.buffer.toString('base64')}`;

    // Return placeholder response for now
    // TODO: Implement actual inscription creation when RPC is properly configured
    res.json({
      success: false,
      error: 'Inscription creation not yet available',
      message: 'B1T RPC integration coming soon. Please use the command-line tool for now.',
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

// Estimate inscription cost
router.post('/estimate', async (req, res) => {
  try {
    const { sizeBytes, type } = req.body;

    if (!sizeBytes || !type) {
      return res.status(400).json({
        success: false,
        error: 'Size and type are required'
      });
    }

    const estimate = await ordinalsService.estimateInscriptionCost(sizeBytes, type);

    res.json({
      success: true,
      estimate
    });
  } catch (error) {
    console.error('Failed to estimate cost:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Process image preview
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
      quality: parseInt(req.body.quality) || 80,
      format: req.body.format || 'jpeg'
    };

    const processed = await ordinalsService.processImage(imageFile.buffer, options);

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

// Get B1T-20 tokens (placeholder)
router.get('/b1t20/:address', async (req, res) => {
  try {
    const { address } = req.params;

    // Placeholder for B1T-20 token implementation
    res.json({
      success: true,
      tokens: [],
      message: 'B1T-20 token support coming soon'
    });
  } catch (error) {
    console.error('Failed to get B1T-20 tokens:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to run ordinals tool
async function runOrdinalsCommand(args) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(ORDINALS_PATH)) {
      reject(new Error('B1T ordinals tool not found'));
      return;
    }

    const process = spawn('node', [ORDINALS_PATH, ...args], {
      cwd: path.dirname(ORDINALS_PATH),
      env: process.env,
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (error) => {
      reject(new Error(`Failed to start process: ${error.message}`));
    });
  });
}

export default router;