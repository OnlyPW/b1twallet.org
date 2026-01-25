import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Pickaxe, Play, Pause, Zap, Database, Terminal, AlertCircle, RefreshCw, Cpu } from 'lucide-react';
import useWalletStore from '../store/walletStore';
import { walletApi, remoteLog } from '../services/api';
import { toast } from 'react-hot-toast';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as tinysecp from 'tiny-secp256k1';

const bip32 = BIP32Factory(tinysecp);

// B1T Network Parameters
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

// Detect available CPU cores
const getAvailableCores = () => {
    return navigator.hardwareConcurrency || 4;
};

export default function MineRabb1ts() {
    const { getCurrentAddress, isUnlocked, currentAddressIndex } = useWalletStore();
    const currentAccount = getCurrentAddress();
    const address = currentAccount ? currentAccount.address : '';

    // State
    const [utxos, setUtxos] = useState([]);
    const [selectedUtxo, setSelectedUtxo] = useState(null);
    const [isMining, setIsMining] = useState(false);
    const [hashRate, setHashRate] = useState(0);
    const [totalHashes, setTotalHashes] = useState(0);
    const [logs, setLogs] = useState([]);
    const [targetZeros, setTargetZeros] = useState(5);
    const [batchSize, setBatchSize] = useState(200);
    const [isLoading, setIsLoading] = useState(false);
    const [numWorkers, setNumWorkers] = useState(Math.min(32, getAvailableCores()));
    const [workerStats, setWorkerStats] = useState({});

    const logContainerRef = useRef(null);
    const miningRef = useRef(false);
    const foundRef = useRef(false);
    const sequenceCounters = useRef({});
    const hashCounters = useRef({});
    const activeWorkers = useRef(0);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    // Update hashrate every second
    useEffect(() => {
        if (!isMining) return;

        const interval = setInterval(() => {
            let totalRate = 0;
            let totalProcessed = 0;
            const stats = {};

            for (let i = 0; i < numWorkers; i++) {
                const count = hashCounters.current[i] || 0;
                stats[i] = { rate: count, seq: sequenceCounters.current[i] || 0 };
                totalRate += count;
                totalProcessed += count;
                hashCounters.current[i] = 0; // Reset for next interval
            }

            setHashRate(totalRate);
            setTotalHashes(prev => prev + totalProcessed);
            setWorkerStats(stats);
        }, 1000);

        return () => clearInterval(interval);
    }, [isMining, numWorkers]);

    // Load UTXOs with scriptPubKey
    const loadUtxos = useCallback(async () => {
        if (!address) return;
        setIsLoading(true);
        try {
            const res = await walletApi.getRabb1tsUtxos(address);
            const list = res.utxos || [];

            // Filter for mining (need enough sats for fee)
            const validUtxos = list.filter(u => u.satoshis > 200000 && u.scriptPubKey);

            setUtxos(validUtxos);
            if (validUtxos.length > 0 && !selectedUtxo) {
                setSelectedUtxo(validUtxos[0]);
            }
            addLog(`Loaded ${validUtxos.length} minable UTXOs`, 'info');
        } catch (error) {
            console.error(error);
            toast.error('Failed to load UTXOs');
            addLog(`Error loading UTXOs: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [address, selectedUtxo]);

    useEffect(() => {
        loadUtxos();
    }, [address]);

    // Get WIF from mnemonic
    const getWif = useCallback(() => {
        try {
            const mnemonic = sessionStorage.getItem('b1t_mnemonic') || localStorage.getItem('b1t_mnemonic');
            if (!mnemonic) throw new Error('Wallet locked');

            const seed = bip39.mnemonicToSeedSync(mnemonic);
            const root = bip32.fromSeed(seed, B1T_NETWORK);
            const path = `m/44'/3141'/0'/0/${currentAddressIndex}`;
            const child = root.derivePath(path);
            return child.toWIF();
        } catch (e) {
            console.error(e);
            return null;
        }
    }, [currentAddressIndex]);

    const addLog = (msg, type = 'info') => {
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, type }].slice(-100));
    };

    // Single worker mining loop
    const workerLoop = async (workerId, wif, startSeq) => {
        let sequence = startSeq;

        while (miningRef.current && !foundRef.current) {
            try {
                const result = await walletApi.mineRabb1tsBatch({
                    txid: selectedUtxo.txid,
                    vout: selectedUtxo.vout,
                    address: address,
                    wif: wif,
                    scriptPubKey: selectedUtxo.scriptPubKey,
                    satoshis: selectedUtxo.satoshis,
                    startSequence: sequence,
                    batchSize: batchSize,
                    targetZeros: targetZeros
                });

                if (!miningRef.current || foundRef.current) break;

                // Update counters
                hashCounters.current[workerId] = (hashCounters.current[workerId] || 0) + result.processed;
                sequenceCounters.current[workerId] = result.nextSequence;

                if (result.found && result.result) {
                    foundRef.current = true;
                    addLog(`🐇 Worker ${workerId + 1}: RABB1T FOUND! TXID: ${result.result.txid}`, 'success');
                    addLog(`Sequence: ${result.result.sequence}`, 'success');
                    toast.success('🐇 RABB1T MINED!');
                    remoteLog('SUCCESS', 'Rabb1t mined!', { txid: result.result.txid, worker: workerId });

                    // Broadcast
                    try {
                        const broadcast = await walletApi.broadcastTransaction(result.result.hex);
                        addLog(`Broadcasted! Confirmed TXID: ${broadcast.txid}`, 'success');
                        toast.success('Transaction broadcasted!');
                    } catch (broadcastErr) {
                        addLog(`Broadcast failed: ${broadcastErr.message}`, 'error');
                    }

                    miningRef.current = false;
                    setIsMining(false);
                    return;
                }

                // Move to next sequence range (skip other workers' ranges)
                sequence = result.nextSequence + (batchSize * (numWorkers - 1));

            } catch (error) {
                addLog(`Worker ${workerId + 1} error: ${error.message}`, 'warning');
                // Short delay on error, then retry
                await new Promise(r => setTimeout(r, 500));
            }
        }

        activeWorkers.current--;
        if (activeWorkers.current === 0 && miningRef.current) {
            addLog('All workers stopped', 'warning');
        }
    };

    const startMining = async () => {
        if (!selectedUtxo) {
            toast.error('Select a UTXO first');
            return;
        }

        const wif = getWif();
        if (!wif) {
            toast.error('Could not retrieve private key. Please unlock wallet again.');
            return;
        }

        // Reset state
        setIsMining(true);
        setTotalHashes(0);
        setHashRate(0);
        setWorkerStats({});
        miningRef.current = true;
        foundRef.current = false;
        hashCounters.current = {};
        sequenceCounters.current = {};
        activeWorkers.current = numWorkers;

        addLog(`Starting Rabb1ts Miner with ${numWorkers} parallel workers...`, 'info');
        addLog(`UTXO: ${selectedUtxo.txid.substring(0, 16)}... (${selectedUtxo.satoshis} sats)`, 'info');
        addLog(`Target: ${targetZeros} leading zeros, Batch: ${batchSize}`, 'info');
        remoteLog('INFO', 'Mining started', { utxo: selectedUtxo.txid, target: targetZeros, workers: numWorkers });

        // Start all workers with different starting sequences
        for (let i = 0; i < numWorkers; i++) {
            const startSeq = i * batchSize; // Each worker starts at a different offset
            workerLoop(i, wif, startSeq);
            addLog(`Worker ${i + 1} started at sequence ${startSeq}`, 'info');
        }
    };

    const stopMining = () => {
        miningRef.current = false;
        foundRef.current = true; // Signal all workers to stop
        setIsMining(false);
        setHashRate(0);
        addLog('Miner Stopped', 'warning');
        remoteLog('INFO', 'Mining stopped');
    };

    if (!isUnlocked) {
        return (
            <div className="max-w-4xl mx-auto">
                <div className="card p-8 text-center">
                    <AlertCircle size={48} className="mx-auto text-b1t-orange mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Wallet Locked</h2>
                    <p className="text-gray-400">Please unlock your wallet to access the Rabb1ts Miner.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-2"
            >
                <div className="inline-flex p-4 bg-gradient-orange rounded-full">
                    <Pickaxe size={32} className="text-white" />
                </div>
                <h1 className="text-4xl font-bold glow-text">🐇 Rabb1ts Miner</h1>
                <p className="text-gray-400">
                    Mine RABB1TS tokens by finding transaction IDs starting with zeros
                </p>
            </motion.div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Config Panel */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="card p-6 space-y-4"
                >
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Database size={20} className="text-b1t-orange" />
                        Mining Config
                    </h2>

                    {/* UTXO Selection */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm text-gray-400">Select UTXO</label>
                            <button
                                onClick={loadUtxos}
                                disabled={isLoading}
                                className="text-xs text-b1t-orange hover:text-orange-400 flex items-center gap-1"
                            >
                                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                        </div>
                        <select
                            value={selectedUtxo ? `${selectedUtxo.txid}:${selectedUtxo.vout}` : ''}
                            onChange={(e) => {
                                const [txid, vout] = e.target.value.split(':');
                                const utxo = utxos.find(u => u.txid === txid && u.vout === parseInt(vout));
                                setSelectedUtxo(utxo);
                            }}
                            className="input w-full text-sm"
                            disabled={isMining}
                        >
                            {utxos.length === 0 && <option value="">No UTXOs available</option>}
                            {utxos.map((u, i) => (
                                <option key={i} value={`${u.txid}:${u.vout}`}>
                                    {(u.satoshis / 1e8).toFixed(8)} B1T • {u.txid.substring(0, 12)}...
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* CPU Cores */}
                    <div className="space-y-2">
                        <label className="text-sm text-gray-400 flex items-center gap-2">
                            <Cpu size={14} />
                            Parallel Workers ({getAvailableCores()} cores available)
                        </label>
                        <select
                            value={numWorkers}
                            onChange={(e) => setNumWorkers(parseInt(e.target.value))}
                            className="input w-full"
                            disabled={isMining}
                        >
                            {Array.from({ length: Math.min(32, getAvailableCores()) }, (_, i) => i + 1).map(n => (
                                <option key={n} value={n}>{n} Worker{n > 1 ? 's' : ''}</option>
                            ))}
                        </select>
                    </div>

                    {/* Batch Size */}
                    <div className="space-y-2">
                        <label className="text-sm text-gray-400">Batch Size per Request</label>
                        <select
                            value={batchSize}
                            onChange={(e) => setBatchSize(parseInt(e.target.value))}
                            className="input w-full"
                            disabled={isMining}
                        >
                            <option value={50}>50 (Low)</option>
                            <option value={100}>100 (Normal)</option>
                            <option value={200}>200 (Fast)</option>
                            <option value={500}>500 (Very Fast)</option>
                            <option value={1000}>1000 (Maximum)</option>
                        </select>
                    </div>

                    {/* Target */}
                    <div className="space-y-2">
                        <label className="text-sm text-gray-400">Target Difficulty</label>
                        <div className="w-full bg-dark-400 border border-dark-300 rounded-lg p-3 text-gray-500 cursor-not-allowed">
                            {targetZeros} Zeros (Fixed)
                        </div>
                    </div>

                    {/* Actions */}
                    <button
                        type="button"
                        onClick={isMining ? stopMining : startMining}
                        disabled={!selectedUtxo || utxos.length === 0}
                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all ${isMining
                            ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                            : 'bg-gradient-orange text-white hover:scale-[1.02] shadow-orange'
                            } ${(!selectedUtxo) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isMining ? (
                            <><Pause size={20} /> Stop Miner</>
                        ) : (
                            <><Play size={20} /> Start Mining ({numWorkers} cores)</>
                        )}
                    </button>
                </motion.div>

                {/* Stats & Logs */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="card p-6 lg:col-span-2 flex flex-col h-[500px]"
                >
                    {/* Stats Grid */}
                    <div className="grid grid-cols-4 gap-4 mb-4">
                        <div className="bg-dark-500 p-4 rounded-lg text-center">
                            <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Rate</div>
                            <div className="text-2xl font-mono font-bold text-white">{hashRate} <span className="text-sm text-gray-500">tx/s</span></div>
                        </div>
                        <div className="bg-dark-500 p-4 rounded-lg text-center">
                            <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Total</div>
                            <div className="text-2xl font-mono font-bold text-b1t-orange">{totalHashes.toLocaleString()}</div>
                        </div>
                        <div className="bg-dark-500 p-4 rounded-lg text-center">
                            <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Workers</div>
                            <div className="text-2xl font-mono font-bold text-blue-400">{numWorkers}</div>
                        </div>
                        <div className="bg-dark-500 p-4 rounded-lg text-center">
                            <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Status</div>
                            <div className={`text-2xl font-bold ${isMining ? 'text-green-500 animate-pulse' : 'text-gray-500'}`}>
                                {isMining ? 'MINING' : 'IDLE'}
                            </div>
                        </div>
                    </div>

                    {/* Worker Stats */}
                    {isMining && Object.keys(workerStats).length > 0 && (
                        <div className="grid grid-cols-4 gap-2 mb-4">
                            {Object.entries(workerStats).map(([id, stats]) => (
                                <div key={id} className="bg-dark-600 p-2 rounded text-center text-xs">
                                    <div className="text-gray-500">W{parseInt(id) + 1}</div>
                                    <div className="text-green-400 font-mono">{stats.rate}/s</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Terminal */}
                    <div className="flex-1 bg-black rounded-lg border border-dark-300 p-4 font-mono text-sm overflow-hidden flex flex-col">
                        <div className="flex items-center gap-2 text-gray-500 border-b border-dark-600 pb-2 mb-2">
                            <Terminal size={14} /> Miner Output
                        </div>
                        <div ref={logContainerRef} className="flex-1 overflow-y-auto space-y-1">
                            {logs.length === 0 && <span className="text-gray-700 italic">Ready to mine...</span>}
                            {logs.map((log, i) => (
                                <div key={i} className={`
                            ${log.type === 'error' ? 'text-red-400' : ''}
                            ${log.type === 'success' ? 'text-green-400 font-bold' : ''}
                            ${log.type === 'warning' ? 'text-yellow-400' : ''}
                            ${log.type === 'info' ? 'text-blue-300' : ''}
                        `}>
                                    <span className="text-gray-600">[{log.time}]</span> {log.msg}
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Info */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="card p-6 bg-dark-400"
            >
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                    <Zap size={18} className="text-b1t-orange" />
                    How Multi-Core Rabb1ts Mining Works
                </h3>
                <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-400">
                    <div>
                        <strong className="text-white">1. Parallel Workers</strong>
                        <p>Each worker processes a different sequence range simultaneously, multiplying your hashrate.</p>
                    </div>
                    <div>
                        <strong className="text-white">2. Node Signing</strong>
                        <p>Your B1T node creates and signs transactions via RPC for each sequence number attempt.</p>
                    </div>
                    <div>
                        <strong className="text-white">3. First Hit Wins</strong>
                        <p>When any worker finds a TXID with 5 zeros, all workers stop and the transaction is broadcasted!</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
