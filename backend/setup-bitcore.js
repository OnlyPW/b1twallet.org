#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');

async function downloadBitcoreLib() {
  const targetDir = path.resolve(__dirname, 'bitcore-lib-b1t');
  const fallbackDir = path.resolve(__dirname, 'bitcore-lib-xbt');

  console.log('🔧 Setting up B1T bitcore library...');

  try {
    // Remove existing directory if it exists
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    // Try to clone from GitHub
    console.log('📥 Attempting to download bitcore-lib-b1t from GitHub...');

    const { execSync } = require('child_process');

    // Check if git is available
    try {
      execSync('git --version', { stdio: 'ignore' });
      console.log('✅ Git found, cloning from GitHub...');

      // Clone the repository
      execSync('git clone https://github.com/bittoshimoto/bitcore-lib-b1t.git bitcore-lib-b1t', {
        stdio: 'inherit',
        cwd: path.resolve(__dirname)
      });

      console.log('✅ Successfully cloned bitcore-lib-b1t');

    } catch (gitError) {
      console.log('⚠️  Git not available, falling back to axios download...');

      // Fallback: Download the repository as a zip and extract
      const zipUrl = 'https://github.com/bittoshimoto/bitcore-lib-b1t/archive/refs/heads/main.zip';
      const zipPath = path.resolve(__dirname, 'bitcore-lib-b1t.zip');

      const response = await axios.get(zipUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(zipPath, response.data);

      const { execSync } = require('child_process');
      execSync(`unzip -q "${zipPath}"`, { cwd: path.resolve(__dirname) });
      execSync(`mv bitcore-lib-b1t-main bitcore-lib-b1t`, { cwd: path.resolve(__dirname) });
      fs.unlinkSync(zipPath);

      console.log('✅ Successfully downloaded and extracted bitcore-lib-b1t');
    }

    // Check if package.json exists and install dependencies
    const packageJsonPath = path.join(targetDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      console.log('📦 Installing bitcore-lib-b1t dependencies...');
      execSync('npm install', { stdio: 'inherit', cwd: targetDir });
    }

    console.log('✅ B1T bitcore library setup completed successfully!');
    return true;

  } catch (error) {
    console.log('❌ Failed to setup bitcore-lib-b1t:', error.message);

    // Fallback to existing bitcore-lib-xbt if available
    if (fs.existsSync(fallbackDir)) {
      console.log('🔄 Using fallback bitcore-lib-xbt directory...');
      return false;
    } else {
      console.log('❌ No bitcore library available');
      throw new Error('No bitcore library could be setup');
    }
  }
}

// Run the setup
if (require.main === module) {
  downloadBitcoreLib()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { downloadBitcoreLib };