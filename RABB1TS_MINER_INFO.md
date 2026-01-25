# 🐇 Rabb1ts Browser Miner

This feature allows you to mine **RABB1TS** tokens directly within the B1T Web Wallet.

## How it Works (Browser-Based)

Unlike the Python miner which requires a full node RPC connection for every signature, this implementation is **Non-Custodial and Client-Side**:

1.  **Local Signing**: Your Private Key never leaves the browser. We use `bitcoinjs-lib` and `tiny-secp256k1` inside a Web Worker.
2.  **Grinding**: The worker iterates through the `nSequence` field of the transaction input.
3.  **Hashing**: It calculates the Transaction ID (TXID) locally.
4.  **Target**: It looks for a TXID starting with `00000` (5 zeros).
5.  **Broadcast**: Once found, the raw hex is sent to the B1T network via the backend proxy.

## Usage

1.  Unlock your Wallet.
2.  Navigate to **Rabb1ts Miner** in the menu.
3.  Select a **UTXO** (Input) from the dropdown. 
    *   *Requirement*: Must have > 5000 sats value.
4.  Click **Start Mining**.
5.  Watch the Hashrate and Logs.
6.  When a Rabbit is found, it is automatically broadcasted!

## Performance

*   Mining is CPU intensive.
*   We use a separate thread (Web Worker) to keep the UI responsive.
*   Hashrate depends on your CPU speed (Single Core performance).

## Security

*   Private Keys are derived from your Mnemonic in memory only when mining starts.
*   They are passed to the Worker and cleared when mining stops or page is closed.

B1T Wallet v1.2 New Feature
