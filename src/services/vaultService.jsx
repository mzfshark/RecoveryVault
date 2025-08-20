// All logs/messages in English. Ethers v6 service for RecoveryVault.sol
// Align method names with your ABI if they differ.

import { ethers } from "ethers";
import vaultAbi from "../ui/abi/RecoveryVaultABI.json";
import { ensureAllowance } from "./tokenService";

export const ZERO = 0n;
const ONE_DAY = 24n * 60n * 60n; // fallback if ROUND_DELAY() is unavailable

/** Returns RecoveryVault address from env. */
export function getVaultAddress() {
  const addr = import.meta.env.VITE_VAULT_ADDRESS;
  if (!addr) throw new Error("VITE_VAULT_ADDRESS is not set");
  return addr;
}

/** Returns RecoveryVault contract bound to signer/provider. */
export function getVaultContract(signerOrProvider) {
  return new ethers.Contract(getVaultAddress(), vaultAbi, signerOrProvider);
}

/** Get user daily limit/usage (base units). Adjust to your ABI if needed. */
export async function getDailyLimit(provider, user) {
  try {
    const vault = getVaultContract(provider);

    // Common patterns; try both, fall back safely
    const [limit, used] = await Promise.all([
      (async () => {
        try { return await vault.dailyLimit(user); } catch {}
        try { return await vault.dailyLimitUsd(); } catch {}
        return ZERO;
      })(),
      (async () => {
        try { return await vault.dailyUsed(user); } catch {}
        return ZERO;
      })()
    ]);

    return { limit: limit ?? ZERO, used: used ?? ZERO };
  } catch (err) {
    console.error("[VaultService] getDailyLimit error:", err);
    return { limit: ZERO, used: ZERO };
  }
}

/** Get current fee in basis points for a given user and amount. */
export async function getFeeTier(provider, user, amount) {
  try {
    const vault = getVaultContract(provider);
    try {
      const feeBps = await vault.getFeeBps(user, amount);
      return Number(feeBps);
    } catch {}
    return 100; // 1.00% fallback
  } catch (err) {
    console.error("[VaultService] getFeeTier error:", err);
    return 100;
  }
}

/** Fetch Merkle proof off-chain (mock until API is ready). */
export async function fetchMerkleProof(user) {
  try {
    // TODO: replace with real API call:
    // const res = await fetch(`/api/proof?address=${user}`);
    // const data = await res.json();
    // return data.proof;
    return [];
  } catch (err) {
    console.error("[VaultService] fetchMerkleProof error:", err);
    return [];
  }
}

/** Quote redemption output using the vault's logic (USDC or wONE). */
export async function quoteRedeem(provider, tokenIn, amount, preferUSDC = true) {
  try {
    const vault = getVaultContract(provider);
    const result = await vault.quoteRedeem(tokenIn, amount, preferUSDC);

    // Normalize tuple/struct
    if (Array.isArray(result)) {
      const [outAmount, isUSDC] = result;
      return { outAmount: outAmount ?? ZERO, isUSDC: Boolean(isUSDC) };
    }
    if (typeof result === "object" && result) {
      const outAmount = result.outAmount ?? result[0] ?? ZERO;
      const isUSDC = result.isUSDC ?? result[1] ?? preferUSDC;
      return { outAmount, isUSDC: Boolean(isUSDC) };
    }
    return { outAmount: ZERO, isUSDC: preferUSDC };
  } catch (err) {
    console.error("[VaultService] quoteRedeem error:", err);
    return { outAmount: ZERO, isUSDC: preferUSDC };
  }
}

/** Execute redemption. Ensures allowance if the vault pulls tokenIn. */
export async function redeem(signer, { tokenIn, amount, preferUSDC }) {
  try {
    if (!signer) throw new Error("Signer is required");
    if (!tokenIn) throw new Error("tokenIn is required");
    if (!amount || amount <= 0n) throw new Error("amount must be > 0");

    const vault = getVaultContract(signer);
    const user = await signer.getAddress();

    // 1) Merkle proof
    const proof = await fetchMerkleProof(user);

    // 2) Allowance (optional)
    try {
      const spender = vault.target; // ethers v6 contract address
      await ensureAllowance(signer, tokenIn, spender, amount);
    } catch (approveErr) {
      console.error("[VaultService] approve path error:", approveErr);
    }

    // 3) Redeem
    const tx = await vault.redeem(tokenIn, amount, preferUSDC, proof);
    const receipt = await tx.wait();
    return receipt;
  } catch (err) {
    console.error("[VaultService] redeem error:", err);
    throw new Error("Redeem failed. See console for details.");
  }
}

/**
 * High-level vault status derived from contract variables (per provided snippet):
 * - isLocked() → bool
 * - roundStart() → uint256
 * - roundFunds() → uint256
 * - paused() → bool (optional, if Pausable is used)
 * - ROUND_DELAY() → uint256 (public constant; optional getter)
 */
export async function getVaultStatus(provider) {
  try {
    const vault = getVaultContract(provider);

    // Parallel reads with safe fallbacks
    const [paused, locked, roundStart, roundFunds, roundDelay] = await Promise.all([
      (async () => { try { return Boolean(await vault.paused()); } catch { return false; } })(),
      (async () => { try { return Boolean(await vault.isLocked()); } catch { return false; } })(),
      (async () => { try { return await vault.roundStart(); } catch { return 0n; } })(),
      (async () => { try { return await vault.roundFunds(); } catch { return 0n; } })(),
      (async () => { try { return await vault.ROUND_DELAY(); } catch { return ONE_DAY; } })()
    ]);

    const now = BigInt(Math.floor(Date.now() / 1000));

    // If locked, next unlock assumed to be roundStart (start after delay/funding)
    const nextUnlockAt = locked ? roundStart : 0n;

    // Round considered active if: not paused, not locked, started, and funds available
    const roundActive = Boolean(!paused && !locked && now >= roundStart && roundFunds > 0n);

    // You may compute an inferred roundEnd if your logic exposes it; keeping 0n here
    const roundEnd = 0n;

    return { paused, locked, roundActive, nextUnlockAt, roundStart, roundEnd, roundFunds, roundDelay };
  } catch (err) {
    console.error("[VaultService] getVaultStatus error:", err);
    return { paused: false, locked: false, roundActive: false, nextUnlockAt: 0n, roundStart: 0n, roundEnd: 0n, roundFunds: 0n, roundDelay: ONE_DAY };
  }
}
