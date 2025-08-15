// test/vaultService.test.js
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import * as vaultService from '../src/services/vaultService.js';

const mockProvider = {
  getSigner: vi.fn(),
};

const mockContract = {
  redeem: vi.fn(),
  getRemainingLimit: vi.fn(),
  calculateFee: vi.fn(),
  getCurrentRoundId: vi.fn(),
  getRoundInfo: vi.fn(),
  isLocked: vi.fn(),
};

vi.mock('ethers', async () => {
  const original = await vi.importActual('ethers');
  return {
    ...original,
    Contract: vi.fn(() => mockContract),
  };
});

describe('vaultService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls redeem with correct args', async () => {
    const mockTx = { wait: vi.fn(), hash: '0x123' };
    mockContract.redeem.mockResolvedValue(mockTx);
    const result = await vaultService.redeem(mockProvider, '0xToken', '1000000000000000000', ['0xProof']);
    expect(result).toBe('0x123');
    expect(mockContract.redeem).toHaveBeenCalledWith('0xToken', '1000000000000000000', ['0xProof']);
  });

  it('getUserLimit returns correct limit', async () => {
    mockContract.getRemainingLimit.mockResolvedValue(ethers.BigNumber.from('500000000000000000'));
    const result = await vaultService.getUserLimit(mockProvider, '0xWallet');
    expect(result).toBe('500000000000000000');
  });

  it('getFee returns correct value', async () => {
    mockContract.calculateFee.mockResolvedValue(ethers.BigNumber.from('10000000000000000'));
    const result = await vaultService.getFee(mockProvider, '0xToken', '1000000000000000000');
    expect(result).toBe('10000000000000000');
  });

  it('getRoundStatus returns correct structure', async () => {
    mockContract.getCurrentRoundId.mockResolvedValue(ethers.BigNumber.from(3));
    mockContract.getRoundInfo.mockResolvedValue({
      totalAvailable: ethers.BigNumber.from('1000000000000000000'),
      totalRedeemed: ethers.BigNumber.from('200000000000000000'),
    });
    const result = await vaultService.getRoundStatus(mockProvider);
    expect(result).toEqual({
      roundId: '3',
      totalAvailable: '1000000000000000000',
      totalRedeemed: '200000000000000000',
    });
  });

  it('isLocked returns boolean', async () => {
    mockContract.isLocked.mockResolvedValue(true);
    const result = await vaultService.isLocked(mockProvider);
    expect(result).toBe(true);
  });
});
