import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, UserPlus, Send, RefreshCw, Clock, Loader, AtSign,
  Repeat, Edit3, ArrowRightLeft, LogOut, Coins, X, Wallet, CheckCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { walletApi } from '../services/api';
import useWalletStore from '../store/walletStore';

const NICKNAME_ACTIVATION_HEIGHT = 400000;
const BLOCK_SECONDS = 54; // ~54s block time (nicknames.h)

const STATUS_COLORS = {
  ACTIVE: 'text-green-400 bg-green-500/20 border-green-500/30',
  EXPIRED_GRACE: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
  EXPIRED_AVAILABLE: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
  BOND_CLAIMABLE: 'text-purple-400 bg-purple-500/20 border-purple-500/30',
  RELEASED: 'text-gray-400 bg-gray-500/20 border-gray-500/30',
  NOT_REGISTERED: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',
  INVALID: 'text-red-400 bg-red-500/20 border-red-500/30',
};

const MUTABLE = ['ACTIVE', 'EXPIRED_GRACE'];
const AVAILABLE = ['NOT_REGISTERED', 'EXPIRED_AVAILABLE', 'RELEASED'];

function approxDays(blocks) {
  return Math.max(0, Math.round((blocks * BLOCK_SECONDS) / 86400));
}

function shortAddr(a) {
  if (!a) return '-';
  return `${a.slice(0, 8)}...${a.slice(-6)}`;
}

// ─────────────────────────────────────────────────────────────
// Management actions for a name the wallet owns (renew / update /
// transfer / release / claim bond). Self-contained with modals.
// ─────────────────────────────────────────────────────────────
function NameManageActions({ name, onDone }) {
  const { t } = useTranslation();
  const { addresses, getWIFForPubkey } = useWalletStore();
  const [busy, setBusy] = useState(null); // action key
  const [modal, setModal] = useState(null); // 'update' | 'transfer'
  const [payoutInput, setPayoutInput] = useState(name.payout_address || '');
  const [ownerInput, setOwnerInput] = useState('');

  const status = name.status;
  const isMutable = MUTABLE.includes(status);
  const isClaimable = status === 'BOND_CLAIMABLE' || name.claimable_bond;

  const ownerCtx = () => {
    const ctx = getWIFForPubkey(name.owner_pubkey);
    if (!ctx) {
      toast.error(t('names.ownerKeyMissing'));
      return null;
    }
    return ctx;
  };

  const finish = (msg, txid) => {
    toast.success(`${msg}${txid ? ` — ${String(txid).slice(0, 10)}…` : ''}`);
    setModal(null);
    if (onDone) onDone();
  };

  const handleRenew = async () => {
    const ctx = ownerCtx();
    if (!ctx) return;
    let increase = name.renewal_bond_increase;
    try {
      const c = await walletApi.checkNickname(name.nickname);
      increase = c.renewal_bond_increase ?? c.renewal_fee;
    } catch { }
    if (!window.confirm(t('names.confirmRenew', { name: name.nickname, increase: increase ?? '?' }))) return;
    setBusy('renew');
    try {
      const r = await walletApi.renewNickname({ wif: ctx.wif, nickname: name.nickname });
      if (r.success) finish(t('names.toastRenewed', { name: name.nickname }), r.txid);
      else toast.error(r.error || t('names.failRenew'));
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleUpdate = async () => {
    const ctx = ownerCtx();
    if (!ctx) return;
    if (!payoutInput) { toast.error(t('names.enterPayout')); return; }
    setBusy('update');
    try {
      const r = await walletApi.updateNickname({ wif: ctx.wif, nickname: name.nickname, newPayoutAddress: payoutInput.trim() });
      if (r.success) finish(t('names.toastUpdated', { name: name.nickname }), r.txid);
      else toast.error(r.error || t('names.failUpdate'));
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleTransfer = async () => {
    const ctx = ownerCtx();
    if (!ctx) return;
    const pk = ownerInput.trim().toLowerCase();
    if (!/^[0-9a-f]{66}$/.test(pk)) {
      toast.error(t('names.invalidPubkey'));
      return;
    }
    if (!window.confirm(t('names.confirmTransfer', { name: name.nickname, pubkey: pk }))) return;
    setBusy('transfer');
    try {
      const r = await walletApi.transferNickname({ wif: ctx.wif, nickname: name.nickname, newOwnerPubKey: pk });
      if (r.success) finish(t('names.toastTransferred', { name: name.nickname }), r.txid);
      else toast.error(r.error || t('names.failTransfer'));
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleRelease = async () => {
    const ctx = ownerCtx();
    if (!ctx) return;
    if (!window.confirm(t('names.confirmRelease', { name: name.nickname }))) return;
    setBusy('release');
    try {
      const r = await walletApi.releaseNickname({ wif: ctx.wif, nickname: name.nickname });
      if (r.success) finish(t('names.toastReleased', { name: name.nickname }), r.txid);
      else toast.error(r.error || t('names.failRelease'));
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleClaim = async () => {
    const ctx = ownerCtx();
    if (!ctx) return;
    if (!window.confirm(t('names.confirmClaim', { name: name.nickname, bond: name.bond_amount ?? '?' }))) return;
    setBusy('claim');
    try {
      const r = await walletApi.claimNicknameBond({ wif: ctx.wif, nickname: name.nickname });
      if (r.success) finish(t('names.toastClaimed', { name: name.nickname }), r.txid);
      else toast.error(r.error || t('names.failClaim'));
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const Btn = ({ onClick, icon: Icon, label, color = 'bg-[#1A1A1A] hover:bg-[#262626] border border-gray-700', k }) => (
    <button
      onClick={onClick}
      disabled={!!busy}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${color}`}
    >
      {busy === k ? <Loader className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {label}
    </button>
  );

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {isMutable && (
          <>
            <Btn k="renew" onClick={handleRenew} icon={Repeat} label={t('names.actionRenew')} color="bg-[#FF6B00] hover:bg-[#FF8533]" />
            <Btn k="update" onClick={() => { setPayoutInput(name.payout_address || ''); setModal('update'); }} icon={Edit3} label={t('names.actionUpdate')} />
            <Btn k="transfer" onClick={() => { setOwnerInput(''); setModal('transfer'); }} icon={ArrowRightLeft} label={t('names.actionTransfer')} />
            <Btn k="release" onClick={handleRelease} icon={LogOut} label={t('names.actionRelease')} color="bg-red-900/40 hover:bg-red-900/60 border border-red-800" />
          </>
        )}
        {isClaimable && (
          <Btn k="claim" onClick={handleClaim} icon={Coins} label={t('names.actionClaim')} color="bg-purple-700 hover:bg-purple-600" />
        )}
      </div>

      {/* Update payout modal */}
      <AnimatePresence>
        {modal === 'update' && (
          <ModalShell title={t('names.updateModalTitle', { name: name.nickname })} onClose={() => setModal(null)}>
            <label className="block text-xs text-gray-400 mb-1">{t('names.newPayoutLabel')}</label>
            <input
              value={payoutInput}
              onChange={e => setPayoutInput(e.target.value)}
              placeholder={t('names.newPayoutPlaceholder')}
              className="w-full bg-[#0A0A0A] border border-gray-800 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-[#FF6B00] mb-3"
            />
            {addresses?.length > 0 && (
              <>
                <div className="text-xs text-gray-500 mb-1">{t('names.useOwnAddresses')}</div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {addresses.slice(0, 5).map(a => (
                    <button key={a.index} onClick={() => setPayoutInput(a.address)}
                      className="text-xs px-2 py-1 rounded bg-[#1A1A1A] border border-gray-700 hover:border-[#FF6B00]">
                      #{a.index} {shortAddr(a.address)}
                    </button>
                  ))}
                </div>
              </>
            )}
            <ModalActions busy={busy === 'update'} onCancel={() => setModal(null)} onConfirm={handleUpdate} confirmLabel={t('names.btnUpdate')} />
          </ModalShell>
        )}
      </AnimatePresence>

      {/* Transfer modal */}
      <AnimatePresence>
        {modal === 'transfer' && (
          <ModalShell title={t('names.transferModalTitle', { name: name.nickname })} onClose={() => setModal(null)}>
            <label className="block text-xs text-gray-400 mb-1">{t('names.newOwnerLabel')}</label>
            <input
              value={ownerInput}
              onChange={e => setOwnerInput(e.target.value)}
              placeholder={t('names.newOwnerPlaceholder')}
              className="w-full bg-[#0A0A0A] border border-gray-800 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-[#FF6B00] mb-3"
            />
            {addresses?.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-gray-500 mb-1">{t('names.moveToOwn')}</div>
                <div className="flex flex-wrap gap-2">
                  {addresses.slice(0, 5).filter(a => a.publicKey).map(a => (
                    <button key={a.index} onClick={() => setOwnerInput(a.publicKey)}
                      className="text-xs px-2 py-1 rounded bg-[#1A1A1A] border border-gray-700 hover:border-[#FF6B00]">
                      #{a.index} {shortAddr(a.address)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ModalActions busy={busy === 'transfer'} onCancel={() => setModal(null)} onConfirm={handleTransfer} confirmLabel={t('names.btnTransfer')} danger />
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-[#161616] border border-gray-800 rounded-2xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function ModalActions({ busy, onCancel, onConfirm, confirmLabel, danger }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      <button onClick={onCancel} disabled={busy} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-semibold disabled:opacity-50">{t('names.cancel')}</button>
      <button onClick={onConfirm} disabled={busy}
        className={`flex-1 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 ${danger ? 'bg-red-700 hover:bg-red-600' : 'bg-[#FF6B00] hover:bg-[#FF8533]'}`}>
        {busy ? <Loader className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
        {confirmLabel}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function Names() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isUnlocked, addresses, currentAddressIndex, getWIF, getWalletPubkeys } = useWalletStore();

  const [activeTab, setActiveTab] = useState('search'); // search | mine | browse
  const [blockHeight, setBlockHeight] = useState(0);

  // Search
  const [searchInput, setSearchInput] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Register
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [ownerIndex, setOwnerIndex] = useState(currentAddressIndex || 0);
  const [payoutAddress, setPayoutAddress] = useState('');
  const [ownerBalance, setOwnerBalance] = useState(null);

  // My names
  const [myNames, setMyNames] = useState([]);
  const [myLoading, setMyLoading] = useState(false);

  // Browse
  const [allNames, setAllNames] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);

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

  const walletPubkeys = useMemo(
    () => (isUnlocked ? getWalletPubkeys(20).map(p => p.toLowerCase()) : []),
    [isUnlocked, getWalletPubkeys]
  );
  const ownsName = (n) => n?.owner_pubkey && walletPubkeys.includes(String(n.owner_pubkey).toLowerCase());

  // ── Search ──
  const handleSearch = useCallback(async (term) => {
    const input = (term ?? searchInput).trim();
    if (!input) return;
    setSearchLoading(true);
    setSearchResult(null);
    try {
      let name = input.toLowerCase();
      if (name.startsWith('@')) name = name.slice(1);

      const checkData = await walletApi.checkNickname(name);
      if (!checkData || !checkData.valid) {
        setSearchResult({ normalized: checkData?.normalized || name, valid: false, reason: checkData?.reason || t('names.invalidName'), status: 'INVALID' });
        return;
      }

      let info = null;
      try { info = await walletApi.getNicknameInfo(name); } catch { }

      setSearchResult({
        normalized: checkData.normalized || name,
        valid: true,
        status: info?.status || 'NOT_REGISTERED',
        payout_address: info?.payout_address,
        owner_pubkey: info?.owner_pubkey,
        bond_amount: info?.bond_amount,
        active_until: info?.active_until,
        grace_until: info?.grace_until,
        claimable_bond: info?.claimable_bond,
        registrationFee: checkData.registration_fee,
        bondFee: checkData.bond_amount,
        renewalFee: checkData.renewal_fee,
      });
    } catch (e) {
      toast.error(t('names.searchFailed', { message: e.message }));
    } finally {
      setSearchLoading(false);
    }
  }, [searchInput, t]);

  // Load the balance of the selected owner address while the register dialog is open.
  useEffect(() => {
    if (!registerOpen) return;
    const addr = addresses?.[ownerIndex]?.address;
    if (!addr) { setOwnerBalance(null); return; }
    let cancelled = false;
    setOwnerBalance(null);
    walletApi.getBalance(addr)
      .then(res => { if (!cancelled) setOwnerBalance(Number(res.balance ?? res?.balances?.available ?? res?.balances?.confirmed ?? 0) || 0); })
      .catch(() => { if (!cancelled) setOwnerBalance(null); });
    return () => { cancelled = true; };
  }, [registerOpen, ownerIndex, addresses]);

  // ── Register ──
  const openRegister = () => {
    setOwnerIndex(currentAddressIndex || 0);
    const ownerAddr = addresses?.[currentAddressIndex || 0]?.address || addresses?.[0]?.address || '';
    setPayoutAddress(ownerAddr);
    setRegisterOpen(true);
  };

  const handleRegister = async () => {
    if (!isUnlocked || !searchResult?.valid) return;
    const name = searchResult.normalized;
    const owner = addresses?.[ownerIndex];
    if (!owner) { toast.error(t('names.selectOwner')); return; }
    const wif = getWIF(owner.index);
    if (!wif) { toast.error(t('names.walletLocked')); return; }

    setRegisterLoading(true);
    try {
      const result = await walletApi.registerNickname({
        wif,
        nickname: name,
        payoutAddress: (payoutAddress || owner.address).trim(),
      });
      if (result.success) {
        toast.success(`${t('names.toastRegistered', { name })} — ${String(result.txid).slice(0, 10)}…`);
        setRegisterOpen(false);
        setTimeout(() => handleSearch(name), 800);
      } else {
        toast.error(result.error || t('names.registerFailed'));
      }
    } catch (e) {
      toast.error(t('names.registerError', { message: e.message }));
    } finally {
      setRegisterLoading(false);
    }
  };

  // ── My names ──
  const loadMyNames = useCallback(async () => {
    if (!isUnlocked) return;
    setMyLoading(true);
    try {
      const pubkeys = getWalletPubkeys(20);
      const res = await walletApi.getMyNicknames(pubkeys);
      setMyNames(res.nicknames || []);
    } catch (e) {
      toast.error(t('names.loadMineFailed', { message: e.message }));
    } finally {
      setMyLoading(false);
    }
  }, [isUnlocked, getWalletPubkeys, t]);

  // ── Browse ──
  const loadAllNames = useCallback(async () => {
    setBrowseLoading(true);
    try {
      const result = await walletApi.listNicknames({ count: 200 });
      setAllNames(result.nicknames || []);
    } catch (e) {
      console.error('Failed to load nicknames:', e);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'browse') loadAllNames();
    if (activeTab === 'mine') loadMyNames();
  }, [activeTab, loadAllNames, loadMyNames]);

  // Jump to the full Send page with the nickname pre-filled as recipient (it resolves @names,
  // lets you pick the from-address, fee, etc. — the same proven flow as a normal send).
  const openSend = (name) => navigate(`/send?to=${encodeURIComponent('@' + name)}`);

  const Tab = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${activeTab === id ? 'bg-[#FF6B00] text-white' : 'bg-[#1A1A1A] text-gray-400 hover:text-white border border-gray-800'}`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  const daysLabel = (n) => n.status === 'ACTIVE' ? approxDays(n.active_until - blockHeight) : (n.status === 'EXPIRED_GRACE' ? t('names.grace') : '0');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A0A0A] to-[#111] text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <AtSign className="w-8 h-8 text-[#FF6B00]" />
            <h1 className="text-3xl font-bold">{t('names.title')}</h1>
          </div>
          <p className="text-gray-400">{t('names.subtitle')}</p>
        </motion.div>

        {/* Activation warning */}
        {!isActive && blockHeight > 0 && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-300 text-center">
            <Clock className="w-5 h-5 inline mr-2" />
            <span className="font-semibold">{t('names.activation', { block: NICKNAME_ACTIVATION_HEIGHT.toLocaleString() })}</span>
            <span className="block text-sm text-yellow-400/70">
              {t('names.activationRemaining', { remaining: blocksRemaining.toLocaleString(), current: blockHeight.toLocaleString() })}
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Tab id="search" label={t('names.tabLookup')} icon={Search} />
          <Tab id="mine" label={t('names.tabMine')} icon={Wallet} />
          <Tab id="browse" label={t('names.tabAll')} icon={AtSign} />
        </div>

        {/* ───── SEARCH TAB ───── */}
        {activeTab === 'search' && (
          <div>
            <div className="flex gap-2 mb-6">
              <div className="flex-1 flex items-center bg-[#1A1A1A] border border-gray-800 rounded-xl px-4">
                <span className="text-[#FF6B00] font-bold text-lg mr-1">@</span>
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyUp={e => e.key === 'Enter' && handleSearch()}
                  placeholder={t('names.searchPlaceholder')}
                  maxLength={16}
                  className="flex-1 bg-transparent py-3 text-white outline-none"
                />
              </div>
              <button onClick={() => handleSearch()} disabled={searchLoading}
                className="px-6 py-3 bg-[#FF6B00] hover:bg-[#FF8533] disabled:opacity-50 rounded-xl font-semibold">
                {searchLoading ? <Loader className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              </button>
            </div>

            <AnimatePresence>
              {searchResult && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-[#1A1A1A] border border-gray-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-[#FF6B00]">@{searchResult.normalized}</h2>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[searchResult.status] || STATUS_COLORS.NOT_REGISTERED}`}>
                      {searchResult.status}
                    </span>
                  </div>

                  {!searchResult.valid && <p className="text-red-400 mb-2">{searchResult.reason}</p>}

                  {/* Available → pricing + register */}
                  {searchResult.valid && AVAILABLE.includes(searchResult.status) && (
                    <div className="space-y-3">
                      <h3 className="text-sm text-gray-400 uppercase tracking-wider">{t('names.pricingTitle')}</h3>
                      <div className="grid grid-cols-3 gap-3">
                        <Stat label={t('names.feeBurned')} value={`${searchResult.registrationFee} B1T`} />
                        <Stat label={t('names.bondRefundable')} value={`${searchResult.bondFee} B1T`} />
                        <Stat label={t('names.renewal')} value={`${searchResult.renewalFee} B1T`} />
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('names.totalUpfrontLabel')} <b className="text-gray-300">{(Number(searchResult.registrationFee) + Number(searchResult.bondFee)).toFixed(4)} B1T</b> {t('names.bondReturnedNote')}
                      </div>
                      <button
                        onClick={openRegister}
                        disabled={!isUnlocked || !isActive}
                        className="w-full mt-2 py-3 bg-[#FF6B00] hover:bg-[#FF8533] disabled:opacity-50 rounded-xl font-semibold flex items-center justify-center gap-2"
                      >
                        <UserPlus className="w-5 h-5" />
                        {isUnlocked ? t('names.register', { name: searchResult.normalized }) : t('names.unlockToRegister')}
                      </button>
                    </div>
                  )}

                  {/* Taken → details (+ manage if owned, + send) */}
                  {(searchResult.status === 'ACTIVE' || searchResult.status === 'EXPIRED_GRACE' || searchResult.status === 'BOND_CLAIMABLE') && (
                    <div className="space-y-3">
                      {searchResult.payout_address && <KV label={t('names.payoutAddress')} mono value={searchResult.payout_address} />}
                      {searchResult.owner_pubkey && <KV label={t('names.ownerPubkey')} mono value={searchResult.owner_pubkey} />}
                      {typeof searchResult.bond_amount !== 'undefined' && <KV label={t('names.bond')} value={`${searchResult.bond_amount} B1T`} />}
                      {searchResult.active_until ? (
                        <KV label={t('names.expires')} value={t('names.expiresValue', { block: Number(searchResult.active_until).toLocaleString(), days: approxDays(searchResult.active_until - blockHeight) })} />
                      ) : null}

                      {searchResult.status === 'ACTIVE' && (
                        <button onClick={() => openSend(searchResult.normalized)}
                          className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-xl font-semibold flex items-center justify-center gap-2">
                          <Send className="w-5 h-5" /> {t('names.sendTo', { name: searchResult.normalized })}
                        </button>
                      )}

                      {isUnlocked && ownsName(searchResult) && (
                        <div className="pt-2 border-t border-gray-800">
                          <div className="text-xs text-green-400 mb-1 flex items-center gap-1"><Wallet className="w-3 h-3" /> {t('names.youOwn')}</div>
                          <NameManageActions name={searchResult} onDone={() => handleSearch(searchResult.normalized)} />
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ───── MY NAMES TAB ───── */}
        {activeTab === 'mine' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">{t('names.mineTitle')}</h2>
              <button onClick={loadMyNames} disabled={myLoading || !isUnlocked}
                className="p-2 bg-[#1A1A1A] border border-gray-800 rounded-lg hover:border-gray-600 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${myLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {!isUnlocked ? (
              <Empty>{t('names.unlockToManage')}</Empty>
            ) : myLoading ? (
              <Loading>{t('names.loadingMine')}</Loading>
            ) : myNames.length === 0 ? (
              <Empty>
                {t('names.noneOwned')}{' '}
                <button className="text-[#FF6B00] underline" onClick={() => setActiveTab('search')}>{t('names.goLookup')}</button>
              </Empty>
            ) : (
              <div className="space-y-3">
                {myNames.map(n => (
                  <div key={n.nickname} className="bg-[#1A1A1A] border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-lg text-[#FF6B00]">@{n.nickname}</div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLORS[n.status] || ''}`}>{n.status}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
                      <MiniKV label={t('names.colPayout')} value={shortAddr(n.payout_address)} mono />
                      <MiniKV label={t('names.colBond')} value={`${n.bond_amount ?? 0} B1T`} />
                      {n.active_until ? <MiniKV label={t('names.colExpiresBlock')} value={Number(n.active_until).toLocaleString()} /> : <MiniKV label={t('names.expires')} value="-" />}
                      {n.active_until ? <MiniKV label={t('names.colDaysLeft')} value={daysLabel(n)} /> : <MiniKV label="" value="" />}
                    </div>
                    {n.status === 'ACTIVE' && (
                      <div className="mt-2">
                        <button onClick={() => openSend(n.nickname)} className="text-xs text-green-400 hover:underline flex items-center gap-1">
                          <Send className="w-3 h-3" /> {t('names.sendTo', { name: n.nickname })}
                        </button>
                      </div>
                    )}
                    <NameManageActions name={n} onDone={loadMyNames} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ───── BROWSE TAB ───── */}
        {activeTab === 'browse' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">{t('names.allTitle')}</h2>
              <button onClick={loadAllNames} disabled={browseLoading}
                className="p-2 bg-[#1A1A1A] border border-gray-800 rounded-lg hover:border-gray-600">
                <RefreshCw className={`w-4 h-4 ${browseLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {browseLoading ? (
              <Loading>{t('names.loadingAll')}</Loading>
            ) : allNames.length === 0 ? (
              <Empty>{t('names.noneAll')}</Empty>
            ) : (
              <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase">{t('names.colName')}</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase">{t('names.colStatus')}</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase hidden md:table-cell">{t('names.colPayout')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allNames.map(nick => (
                      <tr key={nick.nickname} className="border-b border-gray-800/50 hover:bg-[#0A0A0A] cursor-pointer"
                        onClick={() => { setSearchInput(nick.nickname); setActiveTab('search'); handleSearch(nick.nickname); }}>
                        <td className="px-4 py-3 font-semibold text-[#FF6B00]">@{nick.nickname}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLORS[nick.status] || ''}`}>{nick.status}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400 font-mono hidden md:table-cell">{shortAddr(nick.payout_address)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Register modal */}
        <AnimatePresence>
          {registerOpen && searchResult && (
            <ModalShell title={t('names.registerModalTitle', { name: searchResult.normalized })} onClose={() => setRegisterOpen(false)}>
              <label className="block text-xs text-gray-400 mb-1">{t('names.ownerAddressLabel')}</label>
              <select value={ownerIndex} onChange={e => { const i = parseInt(e.target.value, 10); setOwnerIndex(i); if (!payoutAddress) setPayoutAddress(addresses?.[i]?.address || ''); }}
                className="w-full bg-[#0A0A0A] border border-gray-800 rounded-xl px-4 py-3 text-white outline-none focus:border-[#FF6B00] mb-3">
                {(addresses || []).map(a => (
                  <option key={a.index} value={a.index}>#{a.index} — {shortAddr(a.address)}</option>
                ))}
              </select>

              {ownerBalance !== null && (() => {
                const need = Number(searchResult.registrationFee) + Number(searchResult.bondFee);
                const short = ownerBalance < need;
                return (
                  <div className={`text-xs mb-3 ${short ? 'text-red-400' : 'text-green-400'}`}>
                    {t('names.balanceOfAddress', { balance: ownerBalance.toFixed(4) })}
                    {short ? t('names.notEnoughFor', { need: need.toFixed(2) }) : ' ✓'}
                  </div>
                );
              })()}

              <label className="block text-xs text-gray-400 mb-1">{t('names.payoutLabel')}</label>
              <input value={payoutAddress} onChange={e => setPayoutAddress(e.target.value)}
                className="w-full bg-[#0A0A0A] border border-gray-800 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-[#FF6B00] mb-3" />

              <div className="bg-[#0A0A0A] border border-gray-800 rounded-lg p-3 mb-4 text-sm space-y-1">
                <Row k={t('names.regFeeBurned')} v={`${searchResult.registrationFee} B1T`} />
                <Row k={t('names.bondLocked')} v={`${searchResult.bondFee} B1T`} />
                <div className="border-t border-gray-800 my-1" />
                <Row k={t('names.totalNeeded')} v={t('names.totalNeededValue', { total: (Number(searchResult.registrationFee) + Number(searchResult.bondFee)).toFixed(4) })} bold />
              </div>

              <ModalActions busy={registerLoading} onCancel={() => setRegisterOpen(false)} onConfirm={handleRegister} confirmLabel={t('names.btnRegister')} />
            </ModalShell>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

// ── Small presentational helpers ──
function Stat({ label, value }) {
  return (
    <div className="bg-[#0A0A0A] rounded-lg p-3 border border-gray-800">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
function KV({ label, value, mono }) {
  return (
    <div>
      <span className="text-xs text-gray-500">{label}</span>
      <div className={`text-sm break-all ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
function MiniKV({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
function Row({ k, v, bold }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{k}</span>
      <span className={bold ? 'font-bold' : ''}>{v}</span>
    </div>
  );
}
function Loading({ children }) {
  return <div className="text-center py-12 text-gray-500"><Loader className="w-8 h-8 animate-spin mx-auto mb-2" />{children}</div>;
}
function Empty({ children }) {
  return <div className="text-center py-12 text-gray-500">{children}</div>;
}
