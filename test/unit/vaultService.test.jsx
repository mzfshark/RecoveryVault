// test/vaultService.unit.test.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Ensure a valid contract address is present for the service under test (align with latest test conventions)
vi.stubEnv('VITE_VAULT_ADDRESS', '0x000000000000000000000000000000000000dEaD');
// Backward-compat for service that may still read VITE_RECOVERY_VAULT_ADDRESS
vi.stubEnv('VITE_RECOVERY_VAULT_ADDRESS', '0x000000000000000000000000000000000000dEaD');

// --- Mocks shared across tests ---
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

// Mock the 'ethers' module to provide named exports used by the service
vi.mock('ethers', () => ({
  Contract: vi.fn(() => mockContract),
  isAddress: vi.fn(() => true),
}));

// Import after mocks and env stubbing
import * as vaultService from '../../src/services/vaultService';

describe('vaultService (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // In ethers v6, BrowserProvider.getSigner() is async
    mockProvider.getSigner.mockResolvedValue({});
  });

  it('calls redeem with correct args', async () => {
    const mockTx = {
      wait: vi.fn().mockResolvedValue({ hash: '0x123' }),
      hash: '0x123',
    };
    mockContract.redeem.mockResolvedValue(mockTx);

    const result = await vaultService.redeem(
      mockProvider,
      '0xToken',
      '1000000000000000000',
      ['0xProof']
    );

    expect(result).toBe('0x123');
    expect(mockContract.redeem).toHaveBeenCalledWith(
      '0xToken',
      '1000000000000000000',
      ['0xProof']
    );
    expect(mockTx.wait).toHaveBeenCalled();
  });

  it('getUserLimit returns correct limit', async () => {
    mockContract.getRemainingLimit.mockResolvedValue(500000000000000000n);
    const result = await vaultService.getUserLimit(mockProvider, '0xWallet');
    expect(result).toBe('500000000000000000');
  });

  it('getFee returns correct value', async () => {
    mockContract.calculateFee.mockResolvedValue(10000000000000000n);
    const result = await vaultService.getFee(mockProvider, '0xToken', '1000000000000000000');
    expect(result).toBe('10000000000000000');
  });

  it('getRoundStatus returns correct structure', async () => {
    mockContract.getCurrentRoundId.mockResolvedValue(3n);
    mockContract.getRoundInfo.mockResolvedValue({
      totalAvailable: 1000000000000000000n,
      totalRedeemed: 200000000000000000n,
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
