export function formatUnitsBigInt(v, decimals = 18, maxFrac = 6) {
  try {
    if (typeof v !== "bigint") return "0";
    const base = BigInt(10) ** BigInt(decimals);
    const int = v / base;
    const frac = v % base;

    if (frac === 0n) return int.toString();

    const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
    return fracStr ? `${int}.${fracStr}` : int.toString();
  } catch {
    return "0";
  }
}

export function toFixedPercent(bps) {
  const p = Number(bps) / 100;
  return `${p.toFixed(2)}%`;
}
