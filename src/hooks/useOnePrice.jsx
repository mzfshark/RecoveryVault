// All logs in 
import { useEffect, useState, useMemo } from "react";
import { ethers } from "ethers";

const ORACLE_ABI = [
  // adjust signature to your contract
  // e.g. function getPrice() external view returns (uint256 priceE6);
  "function getPrice() view returns (uint256)"
];

export default function useOnePrice(provider) {
  const [price, setPrice] = useState(null); // number in USD
  const oracleAddr = import.meta.env.VITE_ORACLE_ADDRESS;

  const contract = useMemo(() => {
    try {
      if (!provider || !oracleAddr) return null;
      return new ethers.Contract(oracleAddr, ORACLE_ABI, provider);
    } catch (err) {
      console.error("[useOnePrice] Failed to create oracle contract:", err);
      return null;
    }
  }, [provider, oracleAddr]);

  useEffect(() => {
    if (!contract) {
      setPrice(null);
      return;
    }
    let active = true;

    (async () => {
      try {
        // NOTE: adapt decimals to your oracle (commonly 1e6 or 1e8)
        const raw = await contract.getPrice();
        const p = Number(raw) / 1e6; // adjust if needed
        if (active) setPrice(p);
      } catch (err) {
        console.error("[useOnePrice] getPrice error:", err);
        if (active) setPrice(null);
      }
    })();

    return () => { active = false; };
  }, [contract]);

  return price; // number | null
}
