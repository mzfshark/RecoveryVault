import { useMemo } from "react";
// NOTE: Adjust hooks to your AppKit version
import { useWallet } from "@reown/appkit-react";
import styles from "../../styles/Global.module.css";

export default function WalletConnection() {
  const { isConnected, address, connect, disconnect } = useWallet();

  const short = useMemo(() => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <h3>Wallet</h3>
        {isConnected ? (
          <div className={styles.row}>
            <span className={styles.badge}>{short}</span>
            <button className={styles.button} onClick={disconnect}>Disconnect</button>
          </div>
        ) : (
          <button className={styles.primary} onClick={connect}>Connect Wallet</button>
        )}
      </div>
    </div>
  );
}
