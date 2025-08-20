import { createContext, useContext, useMemo } from "react";
import { ethers } from "ethers";

const ContractContext = createContext(null);

export function ContractProvider({ children }) {
  const value = useMemo(() => {
    try {
      const rpcUrl = import.meta.env.VITE_RPC_URL;
      const vaultAddress = import.meta.env.VITE_VAULT_ADDRESS;

      if (!rpcUrl || !vaultAddress) {
        console.error("[Contract] Missing env vars VITE_RPC_URL or VITE_VAULT_ADDRESS");
        return null;
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // TIP: Import ABI from local file generated at build time
      // import vaultAbi from "../abi/RecoveryVault.abi.json";
      const vaultAbi = []; // TODO: replace with actual ABI

      const vault = new ethers.Contract(vaultAddress, vaultAbi, provider);
      return { provider, vault };
    } catch (err) {
      console.error("[Contract] Failed to init contracts:", err);
      return null;
    }
  }, []);

  return (
    <ContractContext.Provider value={value}>
      {children}
    </ContractContext.Provider>
  );
}

export function useContracts() {
  const ctx = useContext(ContractContext);
  if (!ctx) {
    console.error("[Contract] Context not ready");
  }
  return ctx;
}
