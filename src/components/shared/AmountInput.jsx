import styles from "../../styles/Global.module.css";

export default function AmountInput({ label="Amount", value, onChange, disabled }) {
  return (
    <div className={styles.field}>
      <label>{label}</label>
      <input
        type="number"
        inputMode="decimal"
        placeholder="0.0"
        value={value}
        disabled={disabled}
        onChange={e => onChange?.(e.target.value)}
        className={styles.input}
      />
    </div>
  );
}
