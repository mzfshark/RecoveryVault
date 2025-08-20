import { useMemo } from "react";
import styles from "../../styles/Global.module.css";

/**
 * @param {Object[]} options - [{ address, symbol, logoURI, balance }]
 */
export default function TokenSelect({ label="Token", value, onChange, options=[] }) {
  const safeOptions = useMemo(() => options ?? [], [options]);

  return (
    <div className={styles.field}>
      <label>{label}</label>
      <select
        className={styles.select}
        value={value || ""}
        onChange={e => onChange?.(e.target.value)}
        aria-label="Select token"
      >
        <option value="" disabled>Select a token</option>
        {safeOptions.map(t => (
          <option key={t.address} value={t.address}>
            {t.symbol} {t.balance ? `— ${t.balance}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
