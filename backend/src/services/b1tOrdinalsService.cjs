const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// B1T Ordinals Library Path
const B1T_ORDINALS_PATH = path.resolve(__dirname, '../../B1T-20-Library/b1t-ordinals.js');

class B1TOrdinalsService {
  constructor() {
    this.rpcUrl = process.env.B1T_RPC_URL || 'http://localhost:8332';
    this.rpcUser = process.env.B1T_RPC_USER || 'rpcuser';
    this.rpcPass = process.env.B1T_RPC_PASSWORD || 'rpcpassword';
  }

  // Helper method for RPC requests
  async rpcRequest(method, params = []) {
    try {
      const response = await axios.post(this.rpcUrl, {
        jsonrpc: "1.0",
        id: Date.now(),
        method,
        params
      }, {
        auth: {
          username: this.rpcUser,
          password: this.rpcPass
        },
        timeout: 10000
      });

      if (response.data && response.data.error) {
        throw new Error(response.data.error.message || 'RPC error');
      }

      return response.data.result;
    } catch (error) {
      console.error(`RPC Error (${method}):`, error.message);
      throw error;
    }
  }

  // Helper function to run B1T ordinals commands
  async runB1TCommand(args, cwd = null) {
    return new Promise((resolve, reject) => {
      const workingDir = cwd || path.dirname(B1T_ORDINALS_PATH);

      // Set environment variables for the B1T ordinals tool
      const env = {
        ...process.env,
        NODE_RPC_URL: this.rpcUrl,
        NODE_RPC_USER: this.rpcUser,
        NODE_RPC_PASS: this.rpcPass,
        FEE_PER_KB: '1000000' // 0.01 B1T per KB fee
      };

      const proc = spawn(process.execPath, [B1T_ORDINALS_PATH, ...args], {
        cwd: workingDir,
        env: env,
        stdio: ['pipe', 'pipe', 'pipe']
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
        if (code !== 0) {
          return reject(new Error(`B1T ordinals process exited with code ${code}: ${stderr}`));
        }
        resolve({ stdout, stderr });
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to start B1T ordinals process: ${error.message}`));
      });
    });
  }

  // Check if B1T ordinals tool is available
  async isAvailable() {
    try {
      if (!fs.existsSync(B1T_ORDINALS_PATH)) {
        throw new Error(`B1T ordinals tool not found at: ${B1T_ORDINALS_PATH}`);
      }

      // Test with a simple command
      const result = await this.runB1TCommand(['--help']);
      return result.stdout.length > 0;
    } catch (error) {
      console.warn('B1T ordinals tool not available:', error.message);
      return false;
    }
  }

  // Mint an inscription using B1T-20 library with direct RPC access
  async mintInscription(address, filePath, privateKey) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      if (!fs.existsSync(B1T_ORDINALS_PATH)) {
        throw new Error(`B1T ordinals library not found: ${B1T_ORDINALS_PATH}`);
      }

      // Check if user has sufficient funds for inscription
      const fundInfo = await this.checkUserFunds(address, privateKey);

      if (!fundInfo.hasFunds) {
        return {
          success: false,
          requiresFunding: true,
          address: address,
          message: fundInfo.message,
          error: 'User address needs funding for inscription'
        };
      }

      console.log(`Minting inscription using user address: ${address}`);
      console.log(`Available funds: ${fundInfo.availableSats / 100000000} B1T`);
      console.log(`File: ${filePath}`);
      console.log(`Using B1T ordinals library: ${B1T_ORDINALS_PATH}`);

      // Create temporary B1T-20 wallet with user's private key
      const walletPath = path.join(path.dirname(B1T_ORDINALS_PATH), '.wallet.json');
      const tempWallet = {
        privkey: privateKey,
        address: address,
        utxos: fundInfo.utxos
      };

      fs.writeFileSync(walletPath, JSON.stringify(tempWallet, null, 2));

      try {
        // Now use B1T-20 library with user's wallet
        const result = await this.runB1TCommand(['mint', address, filePath]);

        console.log('B1T-20 mint command stdout:', result.stdout);
        console.log('B1T-20 mint command stderr:', result.stderr);

        // Extract txid from output - try multiple patterns
        let match = result.stdout.match(/inscription txid:\s*([a-fA-F0-9]{64})/i);
        if (!match) {
          // Try alternative patterns
          match = result.stdout.match(/txid:\s*([a-fA-F0-9]{64})/i);
        }
        if (!match) {
          match = result.stdout.match(/([a-fA-F0-9]{64})/i);
        }
        if (!match) {
          throw new Error(`Could not find inscription txid in output. Stdout: ${result.stdout}, Stderr: ${result.stderr}`);
        }

        const txid = match[1];
        console.log(`Inscription minted successfully: ${txid}`);

        return {
          success: true,
          txid,
          output: result.stdout,
          ordinalId: `${txid}i0`,
          address: address,
          availableSats: fundInfo.availableSats,
          message: `Inscription created using user address ${address}`
        };

      } finally {
        // Clean up temporary wallet file
        if (fs.existsSync(walletPath)) {
          fs.unlinkSync(walletPath);
          console.log('Temporary wallet file cleaned up');
        }
      }

    } catch (error) {
      console.error('Failed to mint inscription:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Mint image with B1T-20 metadata (two-step process)
  async mintImageWithMetadata(address, imagePath, name, description = '', privateKey) {
    try {
      console.log('Starting B1T-20 image with metadata minting process...');

      // Check if user has sufficient funds for inscription (do this once upfront)
      const fundInfo = await this.checkUserFunds(address, privateKey);

      if (!fundInfo.hasFunds) {
        return {
          success: false,
          requiresFunding: true,
          address: address,
          message: fundInfo.message,
          error: 'User address needs funding before minting'
        };
      }

      // Step 1: Mint the image using user's address
      console.log('Step 1: Minting image using user address...');
      const imageResult = await this.mintInscription(address, imagePath, privateKey);

      if (!imageResult.success) {
        if (imageResult.requiresFunding) {
          return imageResult; // Pass through funding requirement
        }
        throw new Error(`Failed to mint image: ${imageResult.error}`);
      }

      console.log(`Image minted: ${imageResult.txid}`);

      // Step 2: Create and mint metadata JSON
      const metadata = {
        name: name,
        description: description,
        image_txid: imageResult.txid
      };

      const metadataFilename = `metadata_${Date.now()}.json`;
      const metadataPath = path.resolve(path.dirname(B1T_ORDINALS_PATH), metadataFilename);

      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      console.log(`Step 2: Metadata JSON created at ${metadataPath}`);

      // Mint the metadata using the same user address
      console.log('Step 2: Minting metadata JSON using user address...');
      const metadataResult = await this.mintInscription(address, metadataPath, privateKey);

      // Clean up temporary metadata file
      try {
        fs.unlinkSync(metadataPath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary metadata file:', cleanupError.message);
      }

      if (!metadataResult.success) {
        throw new Error(`Failed to mint metadata: ${metadataResult.error}`);
      }

      console.log(`Metadata minted: ${metadataResult.txid}`);

      return {
        success: true,
        imageTxid: imageResult.txid,
        metadataTxid: metadataResult.txid,
        imageOrdinalId: imageResult.ordinalId,
        metadataOrdinalId: metadataResult.ordinalId,
        metadata,
        address: address,
        availableSats: fundInfo.availableSats,
        summary: {
          imageTxid: imageResult.txid,
          metadataTxid: metadataResult.txid,
          ordinalIds: `${imageResult.ordinalId}, ${metadataResult.ordinalId}`,
          address: address
        }
      };
    } catch (error) {
      console.error('Failed to mint image with metadata:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Mint text inscription with B1T-20 metadata
  async mintTextWithMetadata(address, text, name, description = '', privateKey) {
    try {
      console.log('Starting B1T-20 text inscription with metadata...');

      // Check if user has sufficient funds for inscription (do this once upfront)
      const fundInfo = await this.checkUserFunds(address, privateKey);

      if (!fundInfo.hasFunds) {
        return {
          success: false,
          requiresFunding: true,
          address: address,
          message: fundInfo.message,
          error: 'User address needs funding before minting'
        };
      }

      // Step 1: Create temporary text file
      const textFilename = `inscription_${Date.now()}.txt`;
      const textPath = path.resolve(path.dirname(B1T_ORDINALS_PATH), textFilename);

      fs.writeFileSync(textPath, text, 'utf8');
      console.log(`Step 1: Text file created at ${textPath}`);

      // Mint the text inscription using user's address
      console.log('Step 1: Minting text inscription using user address...');
      const textResult = await this.mintInscription(address, textPath, privateKey);

      // Clean up temporary text file
      try {
        fs.unlinkSync(textPath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary text file:', cleanupError.message);
      }

      if (!textResult.success) {
        if (textResult.requiresFunding) {
          return textResult; // Pass through funding requirement
        }
        throw new Error(`Failed to mint text: ${textResult.error}`);
      }

      console.log(`Text minted: ${textResult.txid}`);

      // Step 2: Create and mint metadata JSON
      const metadata = {
        name: name,
        description: description,
        text_txid: textResult.txid,
        content: text
      };

      const metadataFilename = `metadata_${Date.now()}.json`;
      const metadataPath = path.resolve(path.dirname(B1T_ORDINALS_PATH), metadataFilename);

      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      console.log(`Step 2: Metadata JSON created at ${metadataPath}`);

      // Mint the metadata using the same user address
      console.log('Step 2: Minting metadata JSON using user address...');
      const metadataResult = await this.mintInscription(address, metadataPath, privateKey);

      // Clean up temporary metadata file
      try {
        fs.unlinkSync(metadataPath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary metadata file:', cleanupError.message);
      }

      if (!metadataResult.success) {
        throw new Error(`Failed to mint metadata: ${metadataResult.error}`);
      }

      console.log(`Metadata minted: ${metadataResult.txid}`);

      return {
        success: true,
        textTxid: textResult.txid,
        metadataTxid: metadataResult.txid,
        textOrdinalId: textResult.ordinalId,
        metadataOrdinalId: metadataResult.ordinalId,
        metadata,
        address: address,
        availableSats: fundInfo.availableSats,
        summary: {
          textTxid: textResult.txid,
          metadataTxid: metadataResult.txid,
          ordinalIds: `${textResult.ordinalId}, ${metadataResult.ordinalId}`,
          address: address
        }
      };
    } catch (error) {
      console.error('Failed to mint text with metadata:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get B1T RPC status
  async getRpcStatus() {
    try {
      const response = await axios.post(this.rpcUrl, {
        jsonrpc: "1.0",
        id: Date.now(),
        method: "getblockchaininfo",
        params: []
      }, {
        auth: {
          username: this.rpcUser,
          password: this.rpcPass
        },
        timeout: 5000
      });

      return {
        success: true,
        data: response.data.result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get UTXOs directly from RPC for user address
  async getUserUtxos(address) {
    try {
      console.log('Fetching UTXOs for address:', address);

      const skipScantxoutset = process.env.RPC_SKIP_SCANTXOUTSET === 'true';

      let utxos = [];

      if (!skipScantxoutset) {
        // Try scantxoutset first (more efficient for large blockchains)
        try {
          const scan = await this.rpcRequest('scantxoutset', ['start', [`addr(${address})`]]);
          utxos = (scan.unspents || []).map(u => ({
            txid: u.txid,
            vout: u.vout,
            script: u.scriptPubKey,
            satoshis: Math.round(u.amount * 1e8)
          }));
          console.log(`Found ${utxos.length} UTXOs via scantxoutset`);
        } catch (scanError) {
          console.log('scantxoutset failed, falling back to listunspent:', scanError.message);
        }
      } else {
        console.log('scantxoutset ist deaktiviert, nutze direkt listunspent...');
      }

      // Fallback to listunspent if scantxoutset failed or is disabled
      if (utxos.length === 0) {
        try {
          const unspent = await this.rpcRequest('listunspent', [0, 9999999, [address]]);
          utxos = unspent.map(u => ({
            txid: u.txid,
            vout: u.vout,
            script: u.scriptPubKey,
            satoshis: Math.round(u.amount * 1e8)
          }));
          console.log(`Found ${utxos.length} UTXOs via listunspent`);
        } catch (unspentError) {
          console.log('listunspent failed:', unspentError.message);
        }
      }

      const totalSats = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
      console.log(`Total available: ${totalSats / 100000000} B1T (${totalSats} satoshis)`);

      return {
        utxos,
        totalSats,
        hasSufficientFunds: totalSats >= 1000000, // 0.01 B1T minimum
        address
      };

    } catch (error) {
      console.error('Failed to get UTXOs:', error);
      throw new Error(`UTXO retrieval failed: ${error.message}`);
    }
  }

  // Check if user has sufficient funds for inscription
  async checkUserFunds(address, privateKey) {
    try {
      console.log('Checking funds for address:', address);

      const utxoInfo = await this.getUserUtxos(address);

      if (utxoInfo.hasSufficientFunds) {
        return {
          hasFunds: true,
          availableSats: utxoInfo.totalSats,
          utxos: utxoInfo.utxos,
          message: `User address ${address} has ${utxoInfo.totalSats / 100000000} B1T available for inscription`
        };
      } else {
        return {
          hasFunds: false,
          needsFunds: true,
          availableSats: utxoInfo.totalSats,
          utxos: utxoInfo.utxos,
          message: `User address ${address} has only ${utxoInfo.totalSats / 100000000} B1T. Minimum 0.01 B1T required for inscription.`
        };
      }

    } catch (error) {
      console.error('Failed to check user funds:', error);
      throw new Error(`Fund check failed: ${error.message}`);
    }
  }

  // Import target address into B1T-20 wallet so it can access UTXOs
  async importAddressToWallet(walletAddress, targetAddress) {
    try {
      console.log('Importing address', targetAddress, 'into B1T-20 wallet', walletAddress);

      const result = await this.runB1TCommand(['import', targetAddress]);

      if (result.success === false) {
        console.warn('Address import warning:', result.error);
      } else {
        console.log('Address imported successfully');
      }
    } catch (error) {
      console.warn('Address import failed:', error.message);
    }
  }

  // Schedule cleanup of temporary wallet file
  scheduleWalletCleanup(walletPath) {
    // Clean up after 5 minutes
    setTimeout(() => {
      try {
        if (fs.existsSync(walletPath)) {
          fs.unlinkSync(walletPath);
          console.log('Temporary B1T-20 wallet cleaned up');
        }
      } catch (error) {
        console.warn('Failed to cleanup temporary wallet:', error.message);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  // Sync UTXOs for B1T-20 wallet
  async syncB1T20Wallet() {
    try {
      console.log('Syncing B1T-20 wallet UTXOs...');
      const result = await this.runB1TCommand(['wallet', 'sync']);

      if (result.success === false) {
        console.warn('B1T-20 wallet sync warning:', result.error);
      } else {
        console.log('B1T-20 wallet synced successfully');
      }
    } catch (error) {
      console.warn('B1T-20 wallet sync failed:', error.message);
    }
  }
}

const b1tOrdinalsService = new B1TOrdinalsService();
module.exports = b1tOrdinalsService;