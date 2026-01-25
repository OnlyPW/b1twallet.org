// Backend Mining Worker - runs in separate thread
import { parentPort, workerData } from 'worker_threads';

const { workerId, rpcConfig, miningParams } = workerData;
const { txid, vout, address, wif, scriptPubKey, satoshis, startSequence, batchSize, targetZeros, totalWorkers } = miningParams;

// RPC call helper
async function rpcCall(method, params) {
    const response = await fetch(rpcConfig.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + Buffer.from(`${rpcConfig.user}:${rpcConfig.password}`).toString('base64')
        },
        body: JSON.stringify({
            jsonrpc: '1.0',
            id: 'miner',
            method,
            params
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
}

const FEE = 192000;
const outputAmount = (satoshis - FEE) / 1e8;
const targetPrefix = '0'.repeat(targetZeros);

let sequence = startSequence + (workerId * batchSize);
let processed = 0;
let running = true;

// Listen for stop signal
parentPort.on('message', (msg) => {
    if (msg.type === 'STOP') {
        running = false;
    }
});

async function mine() {
    while (running) {
        try {
            // Create raw transaction
            const rawTx = await rpcCall('createrawtransaction', [
                [{ txid, vout, sequence }],
                { [address]: outputAmount },
                0
            ]);

            // Sign transaction
            const signed = await rpcCall('signrawtransaction', [
                rawTx,
                [{ txid, vout, scriptPubKey, amount: satoshis / 1e8 }],
                [wif]
            ]);

            if (signed.complete) {
                // Decode to get TXID
                const decoded = await rpcCall('decoderawtransaction', [signed.hex]);
                processed++;

                // Check for match
                if (decoded.txid.startsWith(targetPrefix)) {
                    parentPort.postMessage({
                        type: 'FOUND',
                        workerId,
                        txid: decoded.txid,
                        hex: signed.hex,
                        sequence
                    });
                    running = false;
                    return;
                }

                // Progress update every 10 hashes
                if (processed % 10 === 0) {
                    parentPort.postMessage({
                        type: 'PROGRESS',
                        workerId,
                        processed: 10,
                        sequence
                    });
                }
            }

            // Move to next sequence (skip other workers' ranges)
            sequence += totalWorkers * batchSize;

        } catch (error) {
            parentPort.postMessage({
                type: 'ERROR',
                workerId,
                message: error.message
            });
            // Small delay on error
            await new Promise(r => setTimeout(r, 100));
        }
    }

    parentPort.postMessage({ type: 'STOPPED', workerId });
}

mine();
