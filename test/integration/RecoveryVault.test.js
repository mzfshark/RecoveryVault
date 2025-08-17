// test/integration/RecoveryVault.test.js (Mocha + Hardhat, CommonJS)
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

function generateMerkleTree(addresses) {
  const leaves = addresses.map((addr) => keccak256(addr));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = tree.getHexRoot();
  return { tree, root };
}

describe('RecoveryVault (unit tests with generated MerkleTree)', function () {
  this.timeout(20000);

  async function deployFixture() {
    const [owner, user1, user2, dev, rmc] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('ERC20Mock');
    const peggedUSDC = await MockERC20.deploy('peggedUSDC', 'pUSDC', 18);
    const depeggedUSDC = await MockERC20.deploy('depeggedUSDC', 'dUSDC', 18);
    const wONE = await MockERC20.deploy('Wrapped ONE', 'wONE', 18);

    for (let token of [peggedUSDC, depeggedUSDC, wONE]) {
      await token.mint(user1.address, ethers.parseUnits('1000', 18));
      await token.mint(owner.address, ethers.parseUnits('1000', 18));
      await token.mint(user2.address, ethers.parseUnits('1000', 18));
    }

    const MockOracle = await ethers.getContractFactory('MockOracle');
    const oracle = await MockOracle.deploy(ethers.parseUnits('82', 18));

    const users = [user1.address, user2.address];
    const { tree, root } = generateMerkleTree(users);

    const RecoveryVault = await ethers.getContractFactory('RecoveryVault');
    const vault = await RecoveryVault.deploy(
      owner.address,
      dev.address,
      rmc.address,
      wONE.target,
      peggedUSDC.target,
      [depeggedUSDC.target],
      ethers.parseUnits('100', 18),
      oracle.target
    );

    await peggedUSDC.connect(owner).transfer(vault.target, ethers.parseUnits('100', 18));
    await wONE.connect(owner).transfer(vault.target, ethers.parseUnits('100', 18));

    await vault.setMerkleRoot(root);
    await depeggedUSDC.connect(user1).approve(vault.target, ethers.MaxUint256);
    await peggedUSDC.connect(user1).approve(vault.target, ethers.MaxUint256);
    await wONE.connect(user1).approve(vault.target, ethers.MaxUint256);

    return {
      vault,
      peggedUSDC,
      depeggedUSDC,
      wONE,
      user1,
      user2,
      dev,
      rmc,
      oracle,
      root,
      tree,
      ethers,
    };
  }

  it('should reject redeem if not whitelisted', async function () {
    const { vault, depeggedUSDC, user2 } = await loadFixture(deployFixture);
    await time.increase(86401);
    await vault.startNewRound(1);
    await time.increase(86401);
    await expect(
      vault
        .connect(user2)
        .redeem(
          depeggedUSDC.target,
          ethers.parseUnits('10', 18),
          depeggedUSDC.target,
          [],
        ),
    ).to.be.revertedWith('Not whitelisted');
  });

  it('should allow redeem if whitelisted with correct proof', async function () {
    const { vault, depeggedUSDC, peggedUSDC, user1, tree, oracle } = await loadFixture(
      deployFixture,
    );
    const proof = tree.getHexProof(keccak256(user1.address));

    await time.increase(86401);
    await vault.startNewRound(1);
    await time.increase(86401);

    const dailyLimit = await vault.dailyLimitUsd();
    const oracleRate = await oracle.getPrice();
    const maxAmount = (dailyLimit * 10n ** 18n) / oracleRate;
    const amount = maxAmount - 10n ** 18n;

    await expect(
      vault.connect(user1).redeem(depeggedUSDC.target, amount, peggedUSDC.target, proof),
    ).to.emit(vault, 'RedeemProcessed');
  });

  it('should enforce daily limit per wallet', async function () {
    const { vault, depeggedUSDC, peggedUSDC, user1, tree, oracle } = await loadFixture(
      deployFixture,
    );
    const proof = tree.getHexProof(keccak256(user1.address));

    await time.increase(86401);
    await vault.startNewRound(2);
    await time.increase(86401);

    const dailyLimit = await vault.dailyLimitUsd();
    const oracleRate = await oracle.getPrice();
    const exceed = (dailyLimit * 10n ** 18n) / oracleRate + 10n ** 18n;

    await expect(
      vault.connect(user1).redeem(depeggedUSDC.target, exceed, peggedUSDC.target, proof),
    ).to.be.revertedWith('Exceeds daily limit');
  });

  it('should reset limit after 24h', async function () {
    const { vault, depeggedUSDC, peggedUSDC, user1, tree, oracle } = await loadFixture(
      deployFixture,
    );
    const proof = tree.getHexProof(keccak256(user1.address));

    await time.increase(86401);
    await vault.startNewRound(3);
    await time.increase(86401);

    const dailyLimit = await vault.dailyLimitUsd();
    const oracleRate = await oracle.getPrice();
    const halfAmount = ((dailyLimit * 10n ** 18n) / oracleRate) / 2n;

    await vault
      .connect(user1)
      .redeem(depeggedUSDC.target, halfAmount, peggedUSDC.target, proof);
    await time.increase(86401);
    await vault
      .connect(user1)
      .redeem(depeggedUSDC.target, halfAmount, peggedUSDC.target, proof);
  });

  it('should apply correct fee tier', async function () {
    const { vault, depeggedUSDC, peggedUSDC, user1, tree, oracle } = await loadFixture(
      deployFixture,
    );
    const proof = tree.getHexProof(keccak256(user1.address));

    await time.increase(86401);
    await vault.startNewRound(4);
    await time.increase(86401);

    const dailyLimit = await vault.dailyLimitUsd();
    const oracleRate = await oracle.getPrice();
    const amount = (dailyLimit * 10n ** 18n) / oracleRate - 1n;

    await expect(
      vault.connect(user1).redeem(depeggedUSDC.target, amount, peggedUSDC.target, proof),
    ).to.emit(vault, 'BurnToken');
  });
});
