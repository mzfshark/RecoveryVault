// vaultService.js (ethers v6 ready)
// All logs and layout texts MUST be in English (per team guidelines)

import { Contract, isAddress } from 'ethers';
import RecoveryVaultABI from '../../contracts/abis/RecoveryVaultABI';

const VAULT_ADDRESS = process.env.VITE_VAULT_ADDRESS;

/**
 * Resolve a signer/runner from a provider (supports ethers v6 BrowserProvider)
 * Falls back to the provider itself when signer is not available.
 * @param {any} providerOrSigner
 * @returns {Promise<any>} signer or provider
 */
async function getRunner(providerOrSigner) {
  if (!providerOrSigner) {
    console.error('[vaultService][getRunner] providerOrSigner is undefined/null');
    throw new Error('Provider or signer not available');
  }
  try {
    // BrowserProvider in ethers v6: getSigner() is async
    if (typeof providerOrSigner.getSigner === 'function') {
      const signer = await providerOrSigner.getSigner();
      return signer ?? providerOrSigner;
    }
    return providerOrSigner; // Already a signer or a plain provider
  } catch (err) {
    console.error('[vaultService][getRunner] Failed to resolve signer:', err);
    return providerOrSigner; // Non-fatal: keep provider for read-only
  }
}

/**
 * Get a RecoveryVault contract instance.
 * If readOnly = true, binds to provider directly (no signer required).
 * @param {any} providerOrSigner
 * @param {{ readOnly?: boolean }} [opts]
 * @returns {Promise<Contract|null>}
 */
async function getVaultContract(providerOrSigner, opts = {}) {
  const { readOnly = false } = opts;
  try {
    if (!VAULT_ADDRESS || !isAddress(VAULT_ADDRESS)) {
      console.error('[vaultService][getVaultContract] Invalid or missing VAULT_ADDRESS:', VAULT_ADDRESS);
      throw new Error('Invalid contract address');
    }
    const runner = readOnly ? providerOrSigner : await getRunner(providerOrSigner);
    return new Contract(VAULT_ADDRESS, RecoveryVaultABI, runner);
  } catch (err) {
    console.error('[vaultService][getVaultContract] Failed to create contract instance:', err);
    return null;
  }
}

/**
 * Redeem depegged token using whitelist proof.
 * @param {any} providerOrSigner
 * @param {string} token - ERC20 token address to redeem
 * @param {string|bigint} amount - amount in wei
 * @param {string[]} proof - Merkle proof array
 * @returns {Promise<string>} transaction hash
 */
export async function redeem(providerOrSigner, token, amount, proof) {
  try {
    if (!isAddress(token)) {
      console.error('[vaultService][redeem] Invalid token address:', token);
      throw new Error('Invalid token address');
    }
    if (amount === undefined || amount === null) {
      console.error('[vaultService][redeem] Amount is missing');
      throw new Error('Amount is required');
    }
    const vault = await getVaultContract(providerOrSigner);
    if (!vault) throw new Error('Contract instance not available');

    const tx = await vault.redeem(token, amount, proof);
    const receipt = await tx.wait();
    return (receipt && receipt.hash) ? receipt.hash : tx.hash;
  } catch (err) {
    // Bubble up a clean error, but keep verbose log for debugging
    console.error('[vaultService][redeem] Redemption failed:', err);
    throw new Error(err?.reason || err?.shortMessage || err?.message || 'Redemption failed');
  }
}

/**
 * Get remaining user limit for current window/round.
 * @param {any} providerOrSigner
 * @param {string} wallet - wallet address
 * @returns {Promise<string|null>} remaining limit in wei as string, or null on error
 */
export async function getUserLimit(providerOrSigner, wallet) {
  try {
    if (!isAddress(wallet)) {
      console.error('[vaultService][getUserLimit] Invalid wallet address:', wallet);
      return null;
    }
    const vault = await getVaultContract(providerOrSigner, { readOnly: true });
    if (!vault) return null;
    const remaining = await vault.getRemainingLimit(wallet);
    return remaining?.toString?.() ?? String(remaining);
  } catch (err) {
    console.error('[vaultService][getUserLimit] Failed to fetch user limit:', err);
    return null;
  }
}

/**
 * Calculate fee for a given token and amount.
 * @param {any} providerOrSigner
 * @param {string} token - token address
 * @param {string|bigint} amount - amount in wei
 * @returns {Promise<string|null>} fee in wei as string, or null on error
 */
export async function getFee(providerOrSigner, token, amount) {
  try {
    if (!isAddress(token)) {
      console.error('[vaultService][getFee] Invalid token address:', token);
      return null;
    }
    if (amount === undefined || amount === null) {
      console.error('[vaultService][getFee] Amount is missing');
      return null;
    }
    const vault = await getVaultContract(providerOrSigner, { readOnly: true });
    if (!vault) return null;
    const fee = await vault.calculateFee(token, amount);
    return fee?.toString?.() ?? String(fee);
  } catch (err) {
    console.error('[vaultService][getFee] Failed to calculate fee:', err);
    return null;
  }
}

/**
 * Get round status (current round id and aggregate amounts)
 * @param {any} providerOrSigner
 * @returns {Promise<{ roundId: string, totalAvailable: string, totalRedeemed: string } | null>}
 */
export async function getRoundStatus(providerOrSigner) {
  try {
    const vault = await getVaultContract(providerOrSigner, { readOnly: true });
    if (!vault) return null;
    const roundId = await vault.getCurrentRoundId();
    const info = await vault.getRoundInfo(roundId);
    // Defensive: support tuple/struct response shapes
    const totalAvailable = info?.totalAvailable ?? info?.[0];
    const totalRedeemed = info?.totalRedeemed ?? info?.[1];
    return {
      roundId: roundId?.toString?.() ?? String(roundId),
      totalAvailable: totalAvailable?.toString?.() ?? String(totalAvailable),
      totalRedeemed: totalRedeemed?.toString?.() ?? String(totalRedeemed),
    };
  } catch (err) {
    console.error('[vaultService][getRoundStatus] Failed to fetch round status:', err);
    return null;
  }
}

/**
 * Check if the vault is currently locked (cooldown / not started)
 * @param {any} providerOrSigner
 * @returns {Promise<boolean>} true if locked (or on error)
 */
export async function isLocked(providerOrSigner) {
  try {
    const vault = await getVaultContract(providerOrSigner, { readOnly: true });
    if (!vault) return true;
    return Boolean(await vault.isLocked());
  } catch (err) {
    console.error('[vaultService][isLocked] Failed to check lock state:', err);
    return true; // safer fallback
  }
}
