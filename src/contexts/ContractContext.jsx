import { createContext, useContext, useMemo } from "react";
import { ethers } from "ethers";
import vaultAbi from "../ui/abi/RecoveryVaultABI.json";

/**
 * ContractContext
 * Provides a read-only ethers v6 provider and the RecoveryVault contract instance.
 * - Env vars: VITE_RPC_URL, VITE_VAULT_ADDRESS
 * - Logs and error messages in English (project standard)
 * - Use with Reown AppKit for signer in write paths
 */
const ContractContext = createContext(null);

/**
 * @param {{ children: import('react').ReactNode }} props
 */
export function ContractProvider({ children }) {
  const value = useMemo(() => {
    try {
      const rpcUrl = import.meta.env.VITE_RPC_URL;
      const vaultAddress = import.meta.env.VITE_VAULT_ADDRESS;

      if (!rpcUrl || !vaultAddress) {
        console.error("[Contract] Missing env vars VITE_RPC_URL or VITE_VAULT_ADDRESS");
        return null;
      }

      // Read-only provider (JsonRpcProvider). For writes, retrieve signer via Reown AppKit hooks.
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // RecoveryVault read-only contract instance
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
