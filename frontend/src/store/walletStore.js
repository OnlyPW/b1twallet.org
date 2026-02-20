import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { encrypt, decrypt } from '../services/crypto.js';
import * as keyService from '../services/keyService.js';

let _mnemonic = null;

const useWalletStore = create(
  persist(
    (set, get) => ({
      isUnlocked: false,
      addresses: [],
      currentAddressIndex: 0,
      balance: 0,
      transactions: [],
      encryptedVault: null,
      hasVault: false,

      /**
       * Encrypt and store the mnemonic, derive addresses, unlock the wallet.
       */
      createVault: async (mnemonic, password) => {
        const encrypted = await encrypt(mnemonic, password);
        const addresses = keyService.deriveAddresses(mnemonic, 5);
        _mnemonic = mnemonic;
        set({
          encryptedVault: encrypted,
          hasVault: true,
          isUnlocked: true,
          addresses,
          currentAddressIndex: 0,
        });
        // Remove legacy plaintext storage
        try {
          localStorage.removeItem('b1t_mnemonic');
          sessionStorage.removeItem('b1t_mnemonic');
        } catch {}
      },

      /**
       * Decrypt the vault with the user password and unlock.
       */
      unlockVault: async (password) => {
        const { encryptedVault } = get();
        if (!encryptedVault) throw new Error('No vault found');
        const mnemonic = await decrypt(encryptedVault, password);
        if (!keyService.validateMnemonic(mnemonic)) throw new Error('Decryption failed');
        const addresses = keyService.deriveAddresses(mnemonic, 5);
        _mnemonic = mnemonic;
        set({
          isUnlocked: true,
          addresses,
          currentAddressIndex: 0,
        });
      },

      getMnemonic: () => _mnemonic,

      getWIF: (addressIndex) => {
        if (!_mnemonic) return null;
        return keyService.deriveWIF(_mnemonic, addressIndex ?? get().currentAddressIndex);
      },

      getXpub: () => {
        if (!_mnemonic) return null;
        return keyService.deriveXpub(_mnemonic);
      },

      deriveMoreAddresses: (count = 5) => {
        if (!_mnemonic) return [];
        const { addresses } = get();
        const startIndex = addresses.length;
        const newAddrs = keyService.deriveAddresses(_mnemonic, count, startIndex);
        set({ addresses: [...addresses, ...newAddrs] });
        return newAddrs;
      },

      setUnlocked: (status) => set({ isUnlocked: status }),
      setAddresses: (addresses) => set({ addresses }),
      setCurrentAddress: (index) => set({ currentAddressIndex: index }),
      getCurrentAddress: () => {
        const { addresses, currentAddressIndex } = get();
        return addresses[currentAddressIndex] || null;
      },
      setBalance: (balance) => set({ balance }),
      setTransactions: (transactions) => set({ transactions }),

      lockWallet: () => {
        _mnemonic = null;
        try {
          localStorage.removeItem('b1t_mnemonic');
          sessionStorage.removeItem('b1t_mnemonic');
        } catch {}
        return set({
          isUnlocked: false,
          addresses: [],
          currentAddressIndex: 0,
          balance: 0,
          transactions: [],
        });
      },

      unlockWallet: (addresses) => set({
        isUnlocked: true,
        addresses,
        currentAddressIndex: 0,
      }),

      clearWallet: () => {
        _mnemonic = null;
        try {
          localStorage.removeItem('b1t_mnemonic');
          sessionStorage.removeItem('b1t_mnemonic');
        } catch {}
        return set({
          isUnlocked: false,
          addresses: [],
          currentAddressIndex: 0,
          balance: 0,
          transactions: [],
          encryptedVault: null,
          hasVault: false,
        });
      },
    }),
    {
      name: 'b1t-wallet-storage',
      partialize: (state) => ({
        isUnlocked: false,
        addresses: [],
        currentAddressIndex: state.currentAddressIndex,
        encryptedVault: state.encryptedVault,
        hasVault: state.hasVault,
      }),
    }
  )
);

export default useWalletStore;
