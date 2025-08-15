// vaultService.js
import { ethers } from 'ethers';
import RecoveryVaultABI from '../contracts/abis/RecoveryVault.abi.json';

const VAULT_ADDRESS = import.meta.env.VAULT_ADDRESS;

/**
 * Connect to the RecoveryVault contract
 * @param {ethers.Provider} provider 
 * @returns {ethers.Contract}
 */
function getVaultContract(provider) {
  try {
    const signer = provider.getSigner();
    return new ethers.Contract(VAULT_ADDRESS, RecoveryVaultABI, signer);
  } catch (err) {
    console.error('[vaultService][getVaultContract] Failed to connect:', err);
    return null;
  }
}

/**
 * Redeem depegged token
 * @param {string} token - address of the token to redeem
 * @param {string} amount - amount to redeem (in wei)
 * @param {string[]} proof - Merkle proof for whitelist
 */
export async function redeem(provider, token, amount, proof) {
  try {
    const vault = getVaultContract(provider);
    const tx = await vault.redeem(token, amount, proof);
    await tx.wait();
    return tx.hash;
  } catch (err) {
    console.error('[vaultService][redeem] Redemption failed:', err);
    throw new Error('Redemption failed');
  }
}

/**
 * Get user limit
 * @param {string} wallet - wallet address
 * @returns {Promise<string>} limit in wei
 */
export async function getUserLimit(provider, wallet) {
  try {
    const vault = getVaultContract(provider);
    const limit = await vault.getRemainingLimit(wallet);
    return limit.toString();
  } catch (err) {
    console.error('[vaultService][getUserLimit] Failed to fetch user limit:', err);
    return null;
  }
}

/**
 * Estimate fee
 * @param {string} token - token address
 * @param {string} amount - amount in wei
 * @returns {Promise<string>} fee in wei
 */
export async function getFee(provider, token, amount) {
  try {
    const vault = getVaultContract(provider);
    const fee = await vault.calculateFee(token, amount);
    return fee.toString();
  } catch (err) {
    console.error('[vaultService][getFee] Failed to calculate fee:', err);
    return null;
  }
}

/**
 * Get round status
 * @returns {Promise<{ roundId: string, totalAvailable: string, totalRedeemed: string }>} 
 */
export async function getRoundStatus(provider) {
  try {
    const vault = getVaultContract(provider);
    const roundId = await vault.getCurrentRoundId();
    const info = await vault.getRoundInfo(roundId);
    return {
      roundId: roundId.toString(),
      totalAvailable: info.totalAvailable.toString(),
      totalRedeemed: info.totalRedeemed.toString()
    };
  } catch (err) {
    console.error('[vaultService][getRoundStatus] Failed to fetch round status:', err);
    return null;
  }
}

/**
 * Check if vault is locked
 * @returns {Promise<boolean>}
 */
export async function isLocked(provider) {
  try {
    const vault = getVaultContract(provider);
    return await vault.isLocked();
  } catch (err) {
    console.error('[vaultService][isLocked] Failed to check lock state:', err);
    return true; // safer fallback
  }
}
