const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class B1T20Service {
  constructor() {
    this.libraryPath = path.resolve(__dirname, '../../B1T-20-Library');
    this.feePerKb = 1000000; // 0.01 B1T per KB in satoshis
  }

  async estimateInscriptionCost(type, content, name, description = '') {
    try {
      // B1T-20 Library constants
      const MAX_CHUNK_LEN = 240; // Bytes per chunk
      const MAX_PAYLOAD_LEN = 1500; // Bytes per transaction

      let estimatedSize = 0;
      let estimatedTxs = 2; // Default for small content

      if (type === 'text') {
        estimatedSize = content.length + 500; // Text + metadata overhead
        // Calculate transactions for text content
        const chunksNeeded = Math.ceil(content.length / MAX_CHUNK_LEN);
        estimatedTxs = Math.ceil((chunksNeeded * (MAX_CHUNK_LEN + 50)) / MAX_PAYLOAD_LEN) + 1; // +1 for metadata
      } else if (type === 'image') {
        // For images, we need the actual file size
        const imageSize = parseInt(content) || 10000; // content should be file size in bytes
        estimatedSize = imageSize + 500; // Add metadata overhead

        // Calculate transactions for image content (actual B1T-20 logic)
        const chunksNeeded = Math.ceil(imageSize / MAX_CHUNK_LEN);
        estimatedTxs = Math.ceil((chunksNeeded * (MAX_CHUNK_LEN + 50)) / MAX_PAYLOAD_LEN) + 1; // +1 for metadata
      }

      // Calculate fee with 0.01 B1T per KB
      const baseFeeRate = Math.ceil(this.feePerKb / 1024); // satoshis per byte
      const safetyMargin = 1.5; // 50% safety margin
      const estimatedFee = Math.ceil(estimatedSize * baseFeeRate * estimatedTxs * safetyMargin);

      return {
        success: true,
        estimate: {
          type,
          estimatedTxs,
          estimatedSize,
          estimatedFee,
          feeInB1T: estimatedFee / 100000000,
          satoshiPerByte: baseFeeRate,
          breakdown: {
            contentSize: type === 'text' ? content.length : parseInt(content) || 10000,
            metadataSize: 500,
            transactions: estimatedTxs,
            baseRate: `${baseFeeRate} sat/byte`
          }
        }
      };
    } catch (error) {
      throw new Error(`Fee estimation failed: ${error.message}`);
    }
  }

  async mintImageWithMetadata(receiverAddress, imagePath, name, description) {
    return new Promise((resolve, reject) => {
      const b1tOrdinalsPath = path.join(this.libraryPath, 'b1t-ordinals.js');

      // Set environment variables for correct fees
      const env = {
        ...process.env,
        FEE_PER_KB: this.feePerKb.toString(),
        NODE_RPC_URL: process.env.B1T_RPC_URL,
        NODE_RPC_USER: process.env.B1T_RPC_USER,
        NODE_RPC_PASS: process.env.B1T_RPC_PASSWORD
      };

      const proc = spawn('node', [b1tOrdinalsPath, 'mint', receiverAddress, imagePath], {
        cwd: this.libraryPath,
        env
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Parse the output to get transaction IDs
          const txidMatch = stdout.match(/broadcasting tx \d+ of \d+.*?([a-fA-F0-9]{64})/s);
          const txid = txidMatch ? txidMatch[1] : null;

          resolve({
            success: true,
            txid,
            message: 'Image minted successfully',
            output: stdout
          });
        } else {
          reject(new Error(`Minting failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to start minting process: ${error.message}`));
      });
    });
  }

  async mintMetadata(receiverAddress, imageTxid, name, description) {
    return new Promise((resolve, reject) => {
      // Create JSON metadata
      const metadata = {
        name,
        description,
        image_txid: imageTxid
      };

      const metadataJson = JSON.stringify(metadata);
      const metadataPath = path.join(this.libraryPath, 'temp_metadata.json');

      try {
        fs.writeFileSync(metadataPath, metadataJson);

        const b1tOrdinalsPath = path.join(this.libraryPath, 'b1t-ordinals.js');

        // Set environment variables for correct fees
        const env = {
          ...process.env,
          FEE_PER_KB: this.feePerKb.toString(),
          NODE_RPC_URL: process.env.B1T_RPC_URL,
          NODE_RPC_USER: process.env.B1T_RPC_USER,
          NODE_RPC_PASS: process.env.B1T_RPC_PASSWORD
        };

        const proc = spawn('node', [b1tOrdinalsPath, 'mint', receiverAddress, metadataPath], {
          cwd: this.libraryPath,
          env
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          const text = data.toString();
          stdout += text;
        });

        proc.stderr.on('data', (data) => {
          const text = data.toString();
          stderr += text;
        });

        proc.on('close', (code) => {
          // Clean up temporary file
          try {
            fs.unlinkSync(metadataPath);
          } catch (e) {
            // Ignore cleanup errors
          }

          if (code === 0) {
            // Parse the output to get transaction IDs
            const txidMatch = stdout.match(/broadcasting tx \d+ of \d+.*?([a-fA-F0-9]{64})/s);
            const txid = txidMatch ? txidMatch[1] : null;

            resolve({
              success: true,
              txid,
              message: 'Metadata minted successfully',
              output: stdout
            });
          } else {
            reject(new Error(`Metadata minting failed with code ${code}: ${stderr}`));
          }
        });

        proc.on('error', (error) => {
          reject(new Error(`Failed to start metadata minting process: ${error.message}`));
        });
      } catch (error) {
        reject(new Error(`Failed to create metadata file: ${error.message}`));
      }
    });
  }

  async getStatus() {
    try {
      const env = {
        ...process.env,
        NODE_RPC_URL: process.env.B1T_RPC_URL,
        NODE_RPC_USER: process.env.B1T_RPC_USER,
        NODE_RPC_PASS: process.env.B1T_RPC_PASSWORD
      };

      return new Promise((resolve, reject) => {
        const b1tOrdinalsPath = path.join(this.libraryPath, 'b1t-ordinals.js');
        const proc = spawn('node', [b1tOrdinalsPath, 'wallet', 'status'], {
          cwd: this.libraryPath,
          env
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({
              success: true,
              status: 'available',
              message: 'B1T-20 service is available',
              details: stdout.trim()
            });
          } else {
            resolve({
              success: false,
              status: 'unavailable',
              message: 'B1T-20 service unavailable',
              error: stderr.trim()
            });
          }
        });

        proc.on('error', (error) => {
          resolve({
            success: false,
            status: 'error',
            message: 'B1T-20 service error',
            error: error.message
          });
        });
      });
    } catch (error) {
      return {
        success: false,
        status: 'error',
        message: 'B1T-20 service initialization failed',
        error: error.message
      };
    }
  }
}

module.exports = new B1T20Service();