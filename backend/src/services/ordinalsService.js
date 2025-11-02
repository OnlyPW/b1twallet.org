import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

// Mock RPC client for development
const mockRpcClient = {
  validateAddress: async (address) => ({ isvalid: address && address.length > 20 }),
  getAddressUtxos: async () => [],
  getRawTransaction: async () => ({ vout: [] })
};

class OrdinalsService {
  constructor() {
    this.ordinalsPath = path.join(process.cwd(), '..', 'Extern', 'fork-B1T-ordinals-BIT-20-inscription', 'b1t-ordinals.js');
    this.tempDir = path.join(process.cwd(), 'temp');
    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  // Run B1T ordinals command
  async runOrdinalsCommand(args, options = {}) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.ordinalsPath)) {
        reject(new Error('B1T ordinals tool not found'));
        return;
      }

      const proc = spawn('node', [this.ordinalsPath, ...args], {
        cwd: path.dirname(this.ordinalsPath),
        env: {
          ...process.env,
          NODE_RPC_URL: process.env.RPC_URL || `http://${process.env.RPC_HOST}:${process.env.RPC_PORT}`,
          NODE_RPC_USER: process.env.RPC_USER,
          NODE_RPC_PASS: process.env.RPC_PASSWORD,
          WALLET: '.wallet.json'
        },
        stdio: 'pipe',
        ...options
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        if (options.logOutput) {
          console.log('Ordinals stdout:', text);
        }
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        if (options.logOutput) {
          console.log('Ordinals stderr:', text);
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to start process: ${error.message}`));
      });
    });
  }

  // Initialize wallet
  async initializeWallet() {
    try {
      const walletPath = path.join(path.dirname(this.ordinalsPath), '.wallet.json');

      if (!fs.existsSync(walletPath)) {
        console.log('Creating new B1T ordinals wallet...');
        await this.runOrdinalsCommand(['wallet', 'new']);
      }

      console.log('Syncing wallet...');
      await this.runOrdinalsCommand(['wallet', 'sync']);

      return true;
    } catch (error) {
      console.error('Failed to initialize wallet:', error);
      throw error;
    }
  }

  // Get wallet balance
  async getWalletBalance() {
    try {
      const { stdout } = await this.runOrdinalsCommand(['wallet', 'balance']);
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        if (line.includes('balance')) {
          const balance = parseInt(line.split(' ')[1]);
          return balance;
        }
      }
      return 0;
    } catch (error) {
      console.error('Failed to get wallet balance:', error);
      throw error;
    }
  }

  // Estimate inscription cost
  async estimateInscriptionCost(dataSizeBytes, type = 'image') {
    try {
      const baseFee = 100000; // 0.001 B1T base fee
      const satoshiPerByte = 1; // 1 satoshi per byte

      let estimatedTxs = 1;
      let estimatedSize = dataSizeBytes;

      // For inscriptions, we typically need 2 transactions
      if (type === 'image') {
        estimatedTxs = 2; // Image + metadata
        estimatedSize = dataSizeBytes + 500; // Add metadata size
      }

      const estimatedFee = baseFee + (estimatedSize * satoshiPerByte * estimatedTxs);

      return {
        estimatedTxs,
        estimatedFee,
        estimatedSize,
        feeInB1T: estimatedFee / 100000000
      };
    } catch (error) {
      console.error('Failed to estimate cost:', error);
      throw error;
    }
  }

  // Compress and resize image
  async processImage(inputBuffer, options = {}) {
    const {
      width = 512,
      height = 512,
      quality = 80,
      format = 'jpeg'
    } = options;

    try {
      let image = sharp(inputBuffer);

      // Get original metadata
      const metadata = await image.metadata();

      // More aggressive compression for faster processing
      const targetWidth = Math.min(width, metadata.width || width);
      const targetHeight = Math.min(height, metadata.height || height);

      // Resize image with faster options
      image = image.resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
        fastShrinkOnLoad: true
      });

      // Convert format and compress with optimized settings
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

  // Create text inscription (B1T-20 format)
  async createTextInscription(address, text, name = '', description = '') {
    try {
      // Create B1T-20 JSON metadata
      const b1t20Data = {
        p: "b1t-20",
        op: "mint",
        name: name,
        description: description,
        content: text
      };

      const jsonData = JSON.stringify(b1t20Data);
      const hexData = Buffer.from(jsonData).toString('hex');

      // Create temporary file
      const tempFile = path.join(this.tempDir, `inscription_${Date.now()}.txt`);
      fs.writeFileSync(tempFile, text);

      console.log('Creating text inscription...');
      const { stdout } = await this.runOrdinalsCommand(['mint', address, tempFile], {
        logOutput: true
      });

      // Clean up temp file
      fs.unlinkSync(tempFile);

      // Extract transaction ID
      const match = stdout.match(/inscription txid:\s*([a-fA-F0-9]{64})/);
      if (!match) {
        throw new Error('Could not find inscription txid in output');
      }

      return {
        success: true,
        txid: match[1],
        ordinalId: `${match[1]}i0`,
        data: b1t20Data,
        contentType: 'application/json'
      };
    } catch (error) {
      console.error('Failed to create text inscription:', error);
      throw error;
    }
  }

  // Create image inscription with metadata (2-transaction process)
  async createImageInscription(address, imageBuffer, name, description, options = {}) {
    try {
      // Step 1: Process and mint the image
      console.log('Processing image...');
      const processed = await this.processImage(imageBuffer, options);

      // Create temporary image file
      const imageFile = path.join(this.tempDir, `image_${Date.now()}.${processed.format}`);
      fs.writeFileSync(imageFile, processed.buffer);

      console.log('Step 1: Minting image inscription...');
      const { stdout: imageStdout } = await this.runOrdinalsCommand(['mint', address, imageFile], {
        logOutput: true
      });

      // Extract image transaction ID
      const imageMatch = imageStdout.match(/inscription txid:\s*([a-fA-F0-9]{64})/);
      if (!imageMatch) {
        throw new Error('Could not find image inscription txid');
      }

      const imageTxid = imageMatch[1];

      // Clean up image file
      fs.unlinkSync(imageFile);

      // Step 2: Create JSON metadata
      const metadata = {
        name: name,
        description: description || '',
        image_txid: imageTxid,
        format: processed.format,
        size: processed.compressedSize,
        originalSize: processed.originalSize,
        compressionRatio: processed.compressionRatio,
        dimensions: {
          width: processed.finalWidth,
          height: processed.finalHeight
        }
      };

      const metadataFile = path.join(this.tempDir, `metadata_${Date.now()}.json`);
      fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

      console.log('Step 2: Minting metadata inscription...');
      const { stdout: metaStdout } = await this.runOrdinalsCommand(['mint', address, metadataFile], {
        logOutput: true
      });

      // Extract metadata transaction ID
      const metaMatch = metaStdout.match(/inscription txid:\s*([a-fA-F0-9]{64})/);
      if (!metaMatch) {
        throw new Error('Could not find metadata inscription txid');
      }

      const metaTxid = metaMatch[1];

      // Clean up metadata file
      fs.unlinkSync(metadataFile);

      return {
        success: true,
        imageTxid,
        metaTxid,
        imageOrdinalId: `${imageTxid}i0`,
        metaOrdinalId: `${metaTxid}i0`,
        metadata,
        imageProcessing: processed,
        totalTxs: 2
      };
    } catch (error) {
      console.error('Failed to create image inscription:', error);
      throw error;
    }
  }

  // Clean up temporary files
  cleanup() {
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.tempDir, file));
        }
      }
    } catch (error) {
      console.error('Failed to cleanup temp files:', error);
    }
  }
}

export default new OrdinalsService();