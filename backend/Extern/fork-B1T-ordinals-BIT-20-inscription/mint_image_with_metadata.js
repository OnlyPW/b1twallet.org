// Usage: node mint_image_with_metadata.js <RECEIVER_ADDRESS> <IMAGE_PATH> "<NAME>" "<DESCRIPTION>"
//
// This script demonstrates the two-step workflow:
// 1) Mint an image file (content-type auto-detected, e.g. image/jpeg)
// 2) Create JSON metadata { name, description, image_txid } and mint it as application/json
//
// JSON format produced:
// {
//   "name": "...",
//   "description": "...",
//   "image_txid": "<TXID of the image inscription>"
// }
// This matches the simple metadata used by Plugz Wallet (name + optional description + link via image_txid)
// and is recognized by Ord-Bit as a normal JSON inscription (content-type application/json).
//
// Requirements:
// - Node.js installed
// - RPC access configured via environment variables in a .env near b1t-ordinals.js:
//   NODE_RPC_URL, NODE_RPC_USER, NODE_RPC_PASS
// - Wallet initialized and funded (use `node b1t-ordinals.js wallet new` / `wallet sync` / `wallet split`)
// - Run this script from the project root (same folder as b1t-ordinals.js)
//
// Example:
//   node mint_image_with_metadata.js DSV12KPb8m5b6YtfmqY89K6YqvdVwMYDPn ./image.jpg "Rabb1t #1" "Cute pixel rabbit"
//
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function runMint(address, filePath) {
  return new Promise((resolve, reject) => {
    const b1tOrdinalsPath = path.resolve(__dirname, 'b1t-ordinals.js');
    const proc = spawn(process.execPath, [b1tOrdinalsPath, 'mint', address, filePath], {
      cwd: path.dirname(b1tOrdinalsPath),
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text); // mirror to console
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text); // mirror to console
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`mint process exited with code ${code}\n${stderr}`));
      }
      // b1t-ordinals.js prints: "inscription txid: <hash>" after broadcasting all txs.
      const match = stdout.match(/inscription txid:\s*([a-fA-F0-9]{64})/);
      if (!match) {
        return reject(new Error('Could not find inscription txid in output. Ensure RPC is reachable and wallet funded.'));
      }
      resolve(match[1]);
    });
  });
}

async function main() {
  const [address, imagePath, name, description] = process.argv.slice(2);
  if (!address || !imagePath || !name) {
    console.error('Usage: node mint_image_with_metadata.js <RECEIVER_ADDRESS> <IMAGE_PATH> "<NAME>" "<DESCRIPTION>"');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }

  console.log('Step 1: Mint image...');
  const imageTxid = await runMint(address, imagePath);
  console.log(`Image inscription txid: ${imageTxid}`);

  const metadata = {
    name: name,
    description: description || '',
    image_txid: imageTxid,
  };

  const metadataFilename = `metadata_${Date.now()}.json`;
  const metadataPath = path.resolve(process.cwd(), metadataFilename);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`Step 2: Metadata JSON written to ${metadataPath}`);
  console.log('Minting metadata JSON...');

  const jsonTxid = await runMint(address, metadataPath);
  console.log(`JSON inscription txid: ${jsonTxid}`);

  console.log('\nSummary');
  console.log('--------');
  console.log(`Image TXID:     ${imageTxid}`);
  console.log(`Metadata TXID:  ${jsonTxid}`);
  console.log(`Ordinals ID(s): ${imageTxid}i0, ${jsonTxid}i0`);
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});