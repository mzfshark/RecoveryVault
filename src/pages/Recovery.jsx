import WalletConnection from "../components/wallet/WalletConnection";
import RecoveryRedeemPanel from "../components/recovery/RecoveryRedeemPanel";
import styles from "../styles/Global.module.css";

export default function Recovery() {
  return (
    <div className={styles.container}>
      <WalletConnection />
      <RecoveryRedeemPanel />
    </div>
  );
}
