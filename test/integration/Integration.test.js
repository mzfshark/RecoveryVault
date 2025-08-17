// test/integration/Integration.test.js (Mocha + Hardhat, CommonJS)
const { expect } = require('chai');
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { ethers } = hre;
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const rawProofsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../data/proofs.json'), 'utf-8')
);
const proofs = rawProofsData;
const merkleRootData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../data/merkleRoot.json'), 'utf-8')
);

describe('RecoveryVault Integration (with proofs.json)', function () {
  this.timeout(20000);

  async function deployFixture() {
    const [owner, , , dev, rmc] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('ERC20Mock');
    const peggedUSDC = await MockERC20.deploy('peggedUSDC', 'pUSDC', 18);
    const depeggedUSDC = await MockERC20.deploy('depeggedUSDC', 'dUSDC', 18);
    const wONE = await MockERC20.deploy('Wrapped ONE', 'wONE', 18);

    const allAddresses = Object.keys(proofs);
    const impersonatedAddress = allAddresses[0];

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [impersonatedAddress],
    });
    const user1 = await ethers.getSigner(impersonatedAddress);

    // Fund impersonated user with ONE for gas
    await owner.sendTransaction({
      to: user1.address,
      value: ethers.parseEther('10'),
    });

    // Mint tokens to involved addresses
    await depeggedUSDC.mint(user1.address, ethers.parseUnits('1000', 18));
    await depeggedUSDC.mint(owner.address, ethers.parseUnits('1000', 18));
    await peggedUSDC.mint(owner.address, ethers.parseUnits('1000', 18));
    await wONE.mint(owner.address, ethers.parseUnits('1000', 18));

    const MockOracle = await ethers.getContractFactory('MockOracle');
    const oracle = await MockOracle.deploy(ethers.parseUnits('82', 18));

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

    await vault.setMerkleRoot(ethers.getBytes(merkleRootData.merkleRoot));
    await depeggedUSDC.connect(user1).approve(vault.target, ethers.MaxUint256);

    return { vault, peggedUSDC, depeggedUSDC, wONE, user1, oracle };
  }

  it('should allow redeem using proof from proofs.json', async function () {
    const { vault, depeggedUSDC, peggedUSDC, user1, oracle } = await loadFixture(deployFixture);

    const proof = proofs[user1.address.toLowerCase()];
    expect(proof).to.exist;

    await time.increase(86401);
    await vault.startNewRound(1);
    await time.increase(86401);

    const dailyLimit = await vault.dailyLimitUsd();
    const oracleRate = await oracle.getPrice();
    const maxAmount = (dailyLimit * 10n ** 18n) / oracleRate;
    const amount = maxAmount - 10n ** 17n;

    const tx = await vault.connect(user1).redeem(
      depeggedUSDC.target,
      amount,
      peggedUSDC.target,
      proof
    );
    await tx.wait();

    expect(tx.hash).to.exist;
  });
});
