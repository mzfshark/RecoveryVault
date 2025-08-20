import { useMemo } from "react";
import { useWallet } from "@reown/appkit-react"; // adapt if your AppKit exposes different hooks
import styles from "../../styles/Global.module.css";

/**
 * WalletConnection
 * - Connect/Disconnect wallet using Reown AppKit
 * - Shows short address and a copy-to-clipboard action
 * - English-only texts/logs (project standard)
 */
export default function WalletConnection() {
  const { isConnected, address, connect, disconnect } = useWallet();

  const short = useMemo(() => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  async function onCopy() {
    try {
      if (!address) return;
      await navigator.clipboard.writeText(address);
      console.log("[Wallet] Address copied to clipboard");
    } catch (err) {
      console.error("[Wallet] Failed to copy address:", err);
    }
  }

  return (
    <div className={styles.card} aria-live="polite">
      <div className={styles.row}>
        <h3>Wallet</h3>
        {isConnected ? (
          <div className={styles.row}>
            <span className={styles.badge} title={address}>{short}</span>
            <button className={styles.button} onClick={onCopy}>Copy</button>
            <button className={styles.button} onClick={disconnect}>Disconnect</button>
          </div>
        ) : (
          <button className={styles.primary} onClick={connect}>Connect Wallet</button>
        )}
      </div>
    </div>
  );
}
