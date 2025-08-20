import { useEffect, useState, useMemo } from "react";
import { ethers } from "ethers";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export default function useTokenAllowance(provider, tokenAddress, owner, spender) {
  const [allowance, setAllowance] = useState(0n);
  const [decimals, setDecimals] = useState(18);

  const token = useMemo(() => {
    try {
      if (!provider || !tokenAddress) return null;
      return new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    } catch (err) {
      console.error("[useTokenAllowance] Failed to create token contract:", err);
      return null;
    }
  }, [provider, tokenAddress]);

  useEffect(() => {
    if (!token || !owner || !spender) {
      setAllowance(0n);
      return;
    }
    let active = true;
    (async () => {
      try {
        const [a, d] = await Promise.all([token.allowance(owner, spender), token.decimals()]);
        if (!active) return;
        setAllowance(a);
        setDecimals(Number(d));
      } catch (err) {
        console.error("[useTokenAllowance] allowance error:", err);
        if (active) setAllowance(0n);
      }
    })();
    return () => { active = false; };
  }, [token, owner, spender]);

  return { allowance, decimals };
}
