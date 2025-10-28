import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useWalletStore = create(
  persist(
    (set, get) => ({
      // State
      isUnlocked: false,
      addresses: [],
      currentAddressIndex: 0,
      balance: 0,
      transactions: [],
      
      // Encrypted wallet data (mnemonic wird NIE im Store gespeichert!)
      encryptedSeed: null,
      
      // Actions
      setUnlocked: (status) => set({ isUnlocked: status }),
      
      setAddresses: (addresses) => set({ addresses }),
      
      setCurrentAddress: (index) => set({ currentAddressIndex: index }),
      
      getCurrentAddress: () => {
        const { addresses, currentAddressIndex } = get();
        return addresses[currentAddressIndex] || null;
      },
      
      setBalance: (balance) => set({ balance }),
      
      setTransactions: (transactions) => set({ transactions }),
      
      addTransaction: (transaction) => set((state) => ({
        transactions: [transaction, ...state.transactions],
      })),
      
      lockWallet: () => {
        // Seed aus Storage entfernen (Logout)
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
          encryptedSeed: null,
        });
      },
    }),
    {
      name: 'b1t-wallet-storage',
      partialize: (state) => ({
        // Persistente Felder über F5-Reloads
        // NIEMALS mnemonic oder private keys im Store!
        isUnlocked: state.isUnlocked,
        addresses: state.addresses,
        currentAddressIndex: state.currentAddressIndex,
        encryptedSeed: state.encryptedSeed,
      }),
    }
  )
);

export default useWalletStore;


