import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@reown/appkit-react"; // adjust if your AppKit exposes different hooks
import { useContracts } from "../../contexts/ContractContext";
import { getDailyLimit, getFeeTier, quoteRedeem, redeem } from "../../services/vaultService";
import { getDecimals } from "../../services/tokenService";
import AmountInput from "../shared/AmountInput";
import TokenSelect from "../shared/TokenSelect";
import InfoRow from "../shared/InfoRow";
import Alert from "../shared/Alert";
import { formatUnitsBigInt, toFixedPercent } from "../../utils/format";
import styles from "../../styles/Global.module.css";

/**
 * RecoveryRedeemPanel
 * - Reads daily limit/used
 * - Quotes out amount
 * - Computes fee tier
 * - Executes redeem with Merkle proof (mock until API is ready)
 *
 * NOTES:
 * - All UI text/logs in English
 * - Uses dynamic decimals from tokenIn (ERC20) for parsing amount
 * - For display of OUT amount: uses 6 decimals if isUSDC, else 18 (wONE)
 */
export default function RecoveryRedeemPanel() {
  const { isConnected, address, getSigner } = useWallet();
  const { provider } = useContracts() ?? {};

  // Token selection (mocked list until we wire a real config/service)
  const tokenOptions = useMemo(() => ([
    { address: "0x0000000000000000000000000000000000000001", symbol: "aUSDC" },
    // Add more depegged tokens here when available
  ]), []);

  const [tokenIn, setTokenIn] = useState(tokenOptions[0]?.address || "");
  const [tokenDecimals, setTokenDecimals] = useState(6); // default 6 for aUSDC-like
  const [amount, setAmount] = useState("");
  const [preferUSDC, setPreferUSDC] = useState(true);

  const [limit, setLimit] = useState(0n);
  const [used, setUsed] = useState(0n);
  const [feeBps, setFeeBps] = useState(100); // 1.00% default
  const [quote, setQuote] = useState({ outAmount: 0n, isUSDC: true });
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  // Parse input using tokenIn decimals
  const parsedAmount = useMemo(() => {
    try {
      return amount ? ethers.parseUnits(amount, tokenDecimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, tokenDecimals]);

  // Fetch token decimals when tokenIn changes
  useEffect(() => {
    if (!provider || !tokenIn) return;
    let active = true;
    (async () => {
      try {
        const d = await getDecimals(provider, tokenIn);
        if (active) setTokenDecimals(Number(d || 6));
      } catch (err) {
        console.error("[UI] Failed to fetch token decimals:", err);
        if (active) setTokenDecimals(6);
      }
    })();
    return () => { active = false; };
  }, [provider, tokenIn]);

  // Load user daily limit/used
  useEffect(() => {
    if (!provider || !isConnected || !address) return;
    let active = true;
    (async () => {
      try {
        const { limit, used } = await getDailyLimit(provider, address);
        if (!active) return;
        setLimit(limit);
        setUsed(used);
      } catch (err) {
        console.error("[UI] Failed to fetch daily limit:", err);
      }
    })();
    return () => { active = false; };
  }, [provider, isConnected, address]);

  // Quote on amount or preference change
  useEffect(() => {
    if (!provider || parsedAmount === 0n || !tokenIn) {
      setQuote({ outAmount: 0n, isUSDC: preferUSDC });
      return;
    }
    let active = true;
    (async () => {
      try {
        const q = await quoteRedeem(provider, tokenIn, parsedAmount, preferUSDC);
        if (active) setQuote(q);
      } catch (err) {
        console.error("[UI] quoteRedeem failed:", err);
      }
    })();
    return () => { active = false; };
  }, [provider, tokenIn, parsedAmount, preferUSDC]);

  // Fee tier on amount change
  useEffect(() => {
    if (!provider || !address || parsedAmount === 0n) return;
    let active = true;
    (async () => {
      try {
        const bps = await getFeeTier(provider, address, parsedAmount);
        if (active) setFeeBps(bps);
      } catch (err) {
        console.error("[UI] getFeeTier failed:", err);
      }
    })();
    return () => { active = false; };
  }, [provider, address, parsedAmount]);

  // Simple eligibility check (assumes limit/used units match amount units)
  const canRedeem = isConnected && parsedAmount > 0n && (used + parsedAmount <= limit || limit === 0n);

  async function onRedeem() {
    try {
      if (!canRedeem) return;
      setLoading(true);
      setAlert(null);

      const signer = await getSigner();
      const receipt = await redeem(signer, {
        tokenIn,
        amount: parsedAmount,
        preferUSDC
      });

      setAlert({
        type: "success",
        title: "Redeem successful",
        message: "Your redemption has been processed.",
        tx: receipt?.transactionHash
      });
      setAmount("");
    } catch (err) {
      console.error("[UI] Redeem failed:", err);
      setAlert({ type: "error", title: "Redeem failed", message: err?.message || "Transaction reverted." });
    } finally {
      setLoading(false);
    }
  }

  // Display decimals for out token: USDC(6) or wONE(18)
  const outDecimals = quote.isUSDC ? 6 : 18;

  return (
    <div className={styles.card} aria-busy={loading}>
      <h3>Fixed Redemption</h3>

      <div className={styles.row}>
        <span className={styles.muted}>Daily limit</span>
        <span>{String(used)} / {String(limit)} (base units)</span>
      </div>

      <TokenSelect
        label="Deppegged token"
        value={tokenIn}
        onChange={setTokenIn}
        options={tokenOptions}
      />

      <AmountInput label="Amount to redeem" value={amount} onChange={setAmount} />

      <div className={styles.row}>
        <label>Receive as</label>
        <div className={styles.row}>
          <button
            className={preferUSDC ? styles.primary : styles.button}
            onClick={() => setPreferUSDC(true)}
          >
            USDC
          </button>
          <button
            className={!preferUSDC ? styles.primary : styles.button}
            onClick={() => setPreferUSDC(false)}
          >
            wONE
          </button>
        </div>
      </div>

      <div className={styles.box}>
        <InfoRow label="Quote out" value={formatUnitsBigInt(quote.outAmount, outDecimals)} />
        <InfoRow label="Fee" value={toFixedPercent(feeBps)} />
        {/* Optional: show minOut after fee/slippage if contract exposes it */}
      </div>

      <button
        className={styles.primary}
        disabled={!canRedeem || loading}
        onClick={onRedeem}
        aria-disabled={!canRedeem || loading}
      >
        {loading ? "Processing..." : "Redeem"}
      </button>

      {alert && <Alert {...alert} />}
    </div>
  );
}
