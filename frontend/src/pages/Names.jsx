import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, UserPlus, Send, RefreshCw, Shield, Clock, CheckCircle, XCircle, Loader, AtSign, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { walletApi } from '../services/api';
import useWalletStore from '../store/walletStore';

const NICKNAME_ACTIVATION_HEIGHT = 400000;

const STATUS_COLORS = {
  ACTIVE: 'text-green-400 bg-green-500/20 border-green-500/30',
  EXPIRED_GRACE: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
  EXPIRED_AVAILABLE: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
  BOND_CLAIMABLE: 'text-purple-400 bg-purple-500/20 border-purple-500/30',
  RELEASED: 'text-gray-400 bg-gray-500/20 border-gray-500/30',
  NOT_REGISTERED: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',
};

export default function Names() {
  const { t } = useTranslation();
  const { isUnlocked, addresses, getWIF, getCurrentAddress } = useWalletStore();

  // State
  const [searchInput, setSearchInput] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('search'); // 'search' | 'browse'
  const [allNames, setAllNames] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [blockHeight, setBlockHeight] = useState(0);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendAmount, setSendAmount] = useState('');
  const [sendNickname, setSendNickname] = useState('');

  // Fetch block height
  useEffect(() => {
    const fetchHeight = async () => {
      try {
        const status = await walletApi.getBlockchainStatus();
        setBlockHeight(status.blocks || 0);
      } catch { }
    };
    fetchHeight();
    const interval = setInterval(fetchHeight, 30000);
    return () => clearInterval(interval);
  }, []);

  const isActive = blockHeight >= NICKNAME_ACTIVATION_HEIGHT;
  const blocksRemaining = Math.max(0, NICKNAME_ACTIVATION_HEIGHT - blockHeight);

  // Search nickname
  const handleSearch = useCallback(async () => {
    const input = searchInput.trim();
    if (!input) return;

    setSearchLoading(true);
    setSearchResult(null);

    try {
      let name = input.toLowerCase();
      if (name.startsWith('@')) name = name.slice(1);

      const checkData = await walletApi.checkNickname(name);
      if (!checkData || !checkData.valid) {
        setSearchResult({
          normalized: name,
          valid: false,
          reason: checkData?.reason || 'Invalid nickname',
          status: 'INVALID',
        });
        return;
      }

      // Get full info
      let info = null;
      try {
        info = await walletApi.getNicknameInfo(name);
      } catch { }

      setSearchResult({
        normalized: checkData.normalized || name,
        valid: true,
        status: info?.status || 'NOT_REGISTERED',
        payoutAddress: info?.payout_address,
        ownerPubkey: info?.owner_pubkey,
        bondAmount: info?.bond_amount,
        registrationHeight: info?.registration_height,
        activeUntil: info?.active_until,
        graceUntil: info?.grace_until,
        registrationFee: checkData.registration_fee,
        bondFee: checkData.bond_amount,
        renewalFee: checkData.renewal_fee,
      });
    } catch (e) {
      toast.error('Search failed: ' + e.message);
    } finally {
      setSearchLoading(false);
    }
  }, [searchInput]);

  // Register nickname
  const handleRegister = async () => {
    if (!isUnlocked || !searchResult || !searchResult.valid) return;

    const name = searchResult.normalized;
    const fee = searchResult.registrationFee || 1;
    const bond = searchResult.bondFee || 3;

    if (!confirm(`Register @${name}?\n\nFee: ${fee} B1T\nBond: ${bond} B1T\nTotal: ${fee + bond} B1T`)) {
      return;
    }

    setRegisterLoading(true);
    try {
      const wif = await getWIF();
      const fromAddress = getCurrentAddress();

      const result = await walletApi.registerNickname({
        wif,
        nickname: name,
        payoutAddress: fromAddress,
        fromAddress,
      });

      if (result.success) {
        toast.success(`@${name} registered! TX: ${result.txid?.slice(0, 8)}...`);
        await handleSearch(); // Refresh
      } else {
        toast.error(result.error || 'Registration failed');
      }
    } catch (e) {
      toast.error('Registration error: ' + e.message);
    } finally {
      setRegisterLoading(false);
    }
  };

  // Send to nickname
  const handleSendToNickname = async () => {
    if (!isUnlocked || !sendNickname || !sendAmount) return;

    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Invalid amount');
      return;
    }

    try {
      const wif = await getWIF();
      const fromAddress = getCurrentAddress();

      const result = await walletApi.sendToNickname({
        wif,
        nickname: sendNickname,
        amount,
        fromAddress,
      });

      if (result.success) {
        toast.success(`Sent ${amount} B1T to @${sendNickname}!`);
        setSendDialogOpen(false);
        setSendAmount('');
      } else {
        toast.error(result.error || 'Send failed');
      }
    } catch (e) {
      toast.error('Send error: ' + e.message);
    }
  };

  // Browse all names
  const loadAllNames = useCallback(async () => {
    setBrowseLoading(true);
    try {
      const result = await walletApi.listNicknames({ count: 100 });
      setAllNames(result.nicknames || []);
    } catch (e) {
      console.error('Failed to load nicknames:', e);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'browse') loadAllNames();
  }, [activeTab, loadAllNames]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A0A0A] to-[#111] text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <AtSign className="w-8 h-8 text-[#FF6B00]" />
            <h1 className="text-3xl font-bold">B1T Names</h1>
          </div>
          <p className="text-gray-400">Register and manage on-chain nicknames</p>
        </motion.div>

        {/* Activation Warning */}
        {!isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-300 text-center"
          >
            <Clock className="w-5 h-5 inline mr-2" />
            Nickname feature activates at block <b>{NICKNAME_ACTIVATION_HEIGHT.toLocaleString()}</b>
            <br />
            <span className="text-sm text-yellow-400/70">
              {blocksRemaining.toLocaleString()} blocks remaining (current: {blockHeight.toLocaleString()})
            </span>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'search'
                ? 'bg-[#FF6B00] text-white'
                : 'bg-[#1A1A1A] text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            <Search className="w-4 h-4 inline mr-2" />
            Lookup
          </button>
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'browse'
                ? 'bg-[#FF6B00] text-white'
                : 'bg-[#1A1A1A] text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            All Names
          </button>
        </div>

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div>
            {/* Search Bar */}
            <div className="flex gap-2 mb-6">
              <div className="flex-1 flex items-center bg-[#1A1A1A] border border-gray-800 rounded-xl px-4">
                <span className="text-[#FF6B00] font-bold text-lg mr-1">@</span>
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyUp={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter nickname (e.g. bit_dev)"
                  maxLength={16}
                  className="flex-1 bg-transparent py-3 text-white outline-none"
                  disabled={!isActive}
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searchLoading || !isActive}
                className="px-6 py-3 bg-[#FF6B00] hover:bg-[#FF8533] disabled:opacity-50 rounded-xl font-semibold transition-all"
              >
                {searchLoading ? <Loader className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              </button>
            </div>

            {/* Search Result */}
            <AnimatePresence>
              {searchResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-[#1A1A1A] border border-gray-800 rounded-xl p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-[#FF6B00]">@{searchResult.normalized}</h2>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[searchResult.status] || STATUS_COLORS.NOT_REGISTERED}`}>
                      {searchResult.status}
                    </span>
                  </div>

                  {!searchResult.valid && (
                    <p className="text-red-400 mb-4">{searchResult.reason}</p>
                  )}

                  {searchResult.valid && (searchResult.status === 'NOT_REGISTERED' || searchResult.status === 'EXPIRED_AVAILABLE') && (
                    <div className="space-y-2 mb-6">
                      <h3 className="text-sm text-gray-400 uppercase tracking-wider">Registration Pricing</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-[#0A0A0A] rounded-lg p-3 border border-gray-800">
                          <div className="text-xs text-gray-500">Fee</div>
                          <div className="text-lg font-bold">{searchResult.registrationFee} B1T</div>
                        </div>
                        <div className="bg-[#0A0A0A] rounded-lg p-3 border border-gray-800">
                          <div className="text-xs text-gray-500">Bond</div>
                          <div className="text-lg font-bold">{searchResult.bondFee} B1T</div>
                        </div>
                        <div className="bg-[#0A0A0A] rounded-lg p-3 border border-gray-800">
                          <div className="text-xs text-gray-500">Renewal</div>
                          <div className="text-lg font-bold">{searchResult.renewalFee} B1T</div>
                        </div>
                      </div>
                      <button
                        onClick={handleRegister}
                        disabled={registerLoading || !isUnlocked}
                        className="w-full mt-4 py-3 bg-[#FF6B00] hover:bg-[#FF8533] disabled:opacity-50 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                      >
                        {registerLoading ? <Loader className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                        Register @{searchResult.normalized}
                      </button>
                    </div>
                  )}

                  {(searchResult.status === 'ACTIVE' || searchResult.status === 'EXPIRED_GRACE') && (
                    <div className="space-y-3 mb-4">
                      {searchResult.payoutAddress && (
                        <div>
                          <span className="text-xs text-gray-500">Payout Address</span>
                          <div className="font-mono text-sm break-all">{searchResult.payoutAddress}</div>
                        </div>
                      )}
                      {searchResult.bondAmount && (
                        <div>
                          <span className="text-xs text-gray-500">Bond</span>
                          <div>{searchResult.bondAmount} B1T</div>
                        </div>
                      )}
                      {searchResult.registrationHeight && (
                        <div>
                          <span className="text-xs text-gray-500">Registered at Block</span>
                          <div>{searchResult.registrationHeight?.toLocaleString()}</div>
                        </div>
                      )}
                      {searchResult.status === 'ACTIVE' && (
                        <button
                          onClick={() => { setSendNickname(searchResult.normalized); setSendDialogOpen(true); }}
                          className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                        >
                          <Send className="w-5 h-5" />
                          Send to @{searchResult.normalized}
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Browse Tab */}
        {activeTab === 'browse' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">All Registered Names</h2>
              <button
                onClick={loadAllNames}
                disabled={browseLoading}
                className="p-2 bg-[#1A1A1A] border border-gray-800 rounded-lg hover:border-gray-600 transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${browseLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {browseLoading ? (
              <div className="text-center py-12 text-gray-500">
                <Loader className="w-8 h-8 animate-spin mx-auto mb-2" />
                Loading nicknames...
              </div>
            ) : allNames.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No nicknames registered yet.
              </div>
            ) : (
              <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase">Name</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase">Status</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase hidden md:table-cell">Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allNames.map(nick => (
                      <tr
                        key={nick.nickname}
                        className="border-b border-gray-800/50 hover:bg-[#0A0A0A] cursor-pointer transition-colors"
                        onClick={() => { setSearchInput(nick.nickname); setActiveTab('search'); handleSearch(); }}
                      >
                        <td className="px-4 py-3 font-semibold text-[#FF6B00]">@{nick.nickname}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLORS[nick.status] || ''}`}>
                            {nick.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400 font-mono hidden md:table-cell">
                          {nick.payout_address ? `${nick.payout_address.slice(0, 8)}...${nick.payout_address.slice(-6)}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Send Dialog */}
        <AnimatePresence>
          {sendDialogOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
              onClick={() => setSendDialogOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                className="bg-[#1A1A1A] border border-gray-800 rounded-2xl p-6 w-full max-w-md"
                onClick={e => e.stopPropagation()}
              >
                <h3 className="text-xl font-bold mb-4">Send to @{sendNickname}</h3>
                <input
                  type="number"
                  value={sendAmount}
                  onChange={e => setSendAmount(e.target.value)}
                  placeholder="Amount in B1T"
                  step="0.00000001"
                  min="0"
                  className="w-full bg-[#0A0A0A] border border-gray-800 rounded-xl px-4 py-3 text-white outline-none focus:border-[#FF6B00] mb-4"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setSendDialogOpen(false)}
                    className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendToNickname}
                    className="flex-1 py-3 bg-[#FF6B00] hover:bg-[#FF8533] rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Send
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
