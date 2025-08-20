import styles from "../../styles/Global.module.css";

export default function InfoRow({ label, value }) {
  return (
    <div className={styles.row}>
      <span className={styles.muted}>{label}</span>
      <b>{value}</b>
    </div>
  );
}
