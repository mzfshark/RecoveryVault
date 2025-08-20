// All texts/logs in English
import { createContext, useContext, useMemo } from "react";
// NOTE: Adjust imports to your installed AppKit packages/version.
import { AppKitProvider } from "@reown/appkit-react";
import { createEthersAdapter } from "@reown/ethers6-adapter";
import { ethers } from "ethers";

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 1666600000);

export const harmony = {
  id: CHAIN_ID,
  name: "Harmony",
  nativeCurrency: { name: "ONE", symbol: "ONE", decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_RPC_URL] } },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.harmony.one" }
  },
};

export function ReownProvider({ children }) {
  const adapter = useMemo(() => {
    const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
    return createEthersAdapter({ provider });
  }, []);

  return (
    <AppKitProvider
      projectId={import.meta.env.VITE_REOWN_PROJECT_ID}
      adapters={[adapter]}
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
