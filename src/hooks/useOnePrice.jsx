// src/hooks/useOnePrice.jsx
import { useCallback, useEffect, useState } from "react";
import { Contract, isAddress, formatUnits } from "ethers";
import BAND_ABI from "@/ui/abi/Oracle.json";   // temporarily same as ORACLE_ABI
import ORACLE_ABI from "@/ui/abi/Oracle.json"; // ok while you keep a single ABI
import { useContractContext } from "@/contexts/ContractContext";

/**
 * useOnePrice
 * Tries Band StdReference first (only if ABI contains getReferenceData),
 * then falls back to a custom Oracle (getPrice/latestOnePrice/price).
 * Decimals:
 *  - Band: 1e18
 *  - Oracle: VITE_ORACLE_DECIMALS (default 8)
 * Logs in English, safe guards for wrong addresses or empty code.
 */
export function useOnePrice() {
  const { provider } = useContractContext();
  const band = import.meta.env.VITE_BAND_ADDRESS;       // optional
  const oracle = import.meta.env.VITE_ORACLE_ADDRESS;   // optional
  const oracleDecimals = Number(import.meta.env.VITE_ORACLE_DECIMALS ?? 8);

  const [price, setPrice] = useState(null);
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check if an ABI fragment exists on this contract (ethers v6)
  const hasFn = (iface, fragment) => {
    try { iface.getFunction(fragment); return true; } catch { return false; }
  };

  // Do NOT set state inside load; return a value so the effect can respect cancel flag
  const load = useCallback(async () => {
    if (!provider) return null;

    // 1) Try Band StdReference (only if ABI actually declares it)
    if (isAddress(band)) {
      try {
        const code = await provider.getCode(band);
        if (code !== "0x") {
          const ref = new Contract(band, BAND_ABI, provider);
          if (hasFn(ref.interface, "getReferenceData(string,string)")) {
            const data = await ref.getReferenceData("ONE", "USD");
            // Some proxies return array, others a struct
            const rate = Array.isArray(data) ? data[0] : data.rate;
            const p = Number(formatUnits(rate, 18)); // Band uses 1e18 scale
            return { price: p, source: "band" };
          }
        }
      } catch (e) {
        console.error("[useOnePrice] Band getReferenceData error:", e);
      }
    }

    // 2) Fallback: custom oracle (getPrice / latestOnePrice / price)
    if (isAddress(oracle)) {
      try {
        const code = await provider.getCode(oracle);
        if (code !== "0x") {
          const c = new Contract(oracle, ORACLE_ABI, provider);

          let fn = null;
          if (hasFn(c.interface, "getPrice()")) fn = "getPrice";
          else if (hasFn(c.interface, "latestOnePrice()")) fn = "latestOnePrice";
          else if (hasFn(c.interface, "price()")) fn = "price";

          if (fn) {
            const raw = await c[fn]();
            const val = typeof raw === "bigint" ? raw : (raw?.toString ? BigInt(raw.toString()) : null);
            if (val == null) throw new Error("Oracle returned unexpected value.");
            const p = Number(formatUnits(val, oracleDecimals)); // default 1e8 unless you set VITE_ORACLE_DECIMALS
            return { price: p, source: "oracle" };
          }
        }
      } catch (e) {
        console.error("[useOnePrice] oracle getPrice error:", e);
      }
    }

    // 3) Nothing worked
    return null;
  }, [provider, band, oracle, oracleDecimals]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await load();
        if (!cancelled) {
          if (result) {
            setPrice(result.price);
            setSource(result.source);
          } else {
            setPrice(null);
            setSource(null);
            const err = new Error("No oracle available or all calls failed.");
            setError(err);
            console.error("[useOnePrice]", err.message);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setPrice(null);
          setSource(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [load]);

  return { price, source, loading, error, reload: load };
}
