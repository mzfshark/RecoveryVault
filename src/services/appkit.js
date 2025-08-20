// App-level provider for Reown AppKit (WalletConnect rebrand) + ethers v6 adapter
// All texts/logs in English. Adjust package imports to the exact version you use.

import { useMemo } from "react";
import { AppKitProvider } from "@reown/appkit-react"; // confirm package name/version
import { createEthersAdapter } from "@reown/ethers6-adapter"; // confirm package name/version
import { ethers } from "ethers";

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 1666600000);

export const harmony = {
  id: CHAIN_ID,
  name: "Harmony",
  nativeCurrency: { name: "ONE", symbol: "ONE", decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_RPC_URL] } },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.harmony.one" }
  }
};

/**
 * Wrap your app with <ReownProvider> at src/main.jsx
 * Example:
 *   <ReownProvider>
 *     <ContractProvider>
 *       <App />
 *     </ContractProvider>
 *   </ReownProvider>
 */
export function ReownProvider({ children }) {
  const adapter = useMemo(() => {
    try {
      const rpc = import.meta.env.VITE_RPC_URL;
      if (!rpc) {
        console.error("[AppKit] Missing VITE_RPC_URL env var");
      }
      const provider = new ethers.JsonRpcProvider(rpc);
      return createEthersAdapter({ provider });
    } catch (err) {
      console.error("[AppKit] Failed to create ethers adapter:", err);
      return null;
    }
  }, []);

  return (
    <AppKitProvider
      projectId={import.meta.env.VITE_REOWN_PROJECT_ID}
      adapters={adapter ? [adapter] : []}
      chains={[harmony]}
      metadata={{
        name: import.meta.env.VITE_PROJECT_NAME || "Recovery Dex",
        description: "Fixed redemption UI for pre-hack wallets",
        url: "https://your-domain.example",
        icons: ["https://your-domain.example/icon.png"]
      }}
      enableAnalytics
    >
      {children}
    </AppKitProvider>
  );
}
