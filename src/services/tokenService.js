// All logs/messages in English. Ethers v6 helpers for ERC-20 interactions.
// Exposes getErc20, getSymbol, getDecimals, getBalance, ensureAllowance

import { ethers } from "ethers";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)"
];

/**
 * Returns a typed ERC-20 contract instance (ethers v6) bound to signerOrProvider.
 * @param {string} tokenAddress
 * @param {import('ethers').Provider | import('ethers').Signer} signerOrProvider
 */
export function getErc20(tokenAddress, signerOrProvider) {
  if (!tokenAddress) throw new Error("[TokenService] tokenAddress is required");
  return new ethers.Contract(tokenAddress, ERC20_ABI, signerOrProvider);
}

/** @param {import('ethers').Provider} provider */
export async function getSymbol(provider, tokenAddress) {
  try {
    const t = getErc20(tokenAddress, provider);
    return await t.symbol();
  } catch (err) {
    console.error("[TokenService] getSymbol error:", err);
    return "UNK";
  }
}

/** @param {import('ethers').Provider} provider */
export async function getDecimals(provider, tokenAddress) {
  try {
    const t = getErc20(tokenAddress, provider);
    const d = await t.decimals();
    return Number(d);
  } catch (err) {
    console.error("[TokenService] getDecimals error:", err);
    return 18;
  }
}

/** @param {import('ethers').Provider} provider */
export async function getBalance(provider, tokenAddress, owner) {
  try {
    const t = getErc20(tokenAddress, provider);
    return await t.balanceOf(owner);
  } catch (err) {
    console.error("[TokenService] getBalance error:", err);
    return 0n;
  }
}

/**
 * Ensure allowance >= needed. If below, approve(needed). Returns receipt or null if already sufficient.
 * @param {import('ethers').Signer} signer
 * @param {string} tokenAddress
 * @param {string} spender
 * @param {bigint} needed
 */
export async function ensureAllowance(signer, tokenAddress, spender, needed) {
  try {
    if (!signer) throw new Error("Signer is required");
    if (!tokenAddress) throw new Error("tokenAddress is required");
    if (!spender) throw new Error("spender is required");
    if (needed <= 0n) return null;

    const owner = await signer.getAddress();
    const token = getErc20(tokenAddress, signer);

    const current = await token.allowance(owner, spender);
    if (current >= needed) {
      console.log("[TokenService] Allowance already sufficient");
      return null;
    }

    console.log("[TokenService] Approving allowance...", { needed: needed.toString() });
    const tx = await token.approve(spender, needed);
    const receipt = await tx.wait();
    return receipt;
  } catch (err) {
    console.error("[TokenService] ensureAllowance error:", err);
    throw err;
  }
}
