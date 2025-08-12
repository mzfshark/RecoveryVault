// test/RecoveryVault.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

// Utility to generate Merkle proof
tokenAmountToUSD = (amount, price) => (amount * price) / 1e18;

async function deployFixture() {
  const [owner, user, outsider, dev, rmc] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("ERC20Mock");
  const token = await Token.deploy("MockUSD", "MUSD", owner.address, ethers.parseUnits("1000000", 18));

  const WONE = await Token.deploy("Wrapped ONE", "wONE", owner.address, ethers.parseUnits("1000000", 18));

  const Oracle = await ethers.getContractFactory("MockOracle");
  const oracle = await Oracle.deploy(ethers.parseUnits("1", 18)); // 1 USD = 1 ONE

  const whitelist = [user.address];
  const leaves = whitelist.map((addr) => keccak256(addr));
  const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = merkleTree.getHexRoot();

  const Vault = await ethers.getContractFactory("RecoveryVault");
  const vault = await Vault.deploy(
    owner.address,
    dev.address,
    rmc.address,
    [token.target],
    100 * 1e18, // daily limit in USD
    oracle.target
  );

  await vault.setMerkleRoot(root);

  await WONE.transfer(vault.target, ethers.parseUnits("10000", 18));

  return { owner, user, outsider, dev, rmc, token, vault, merkleTree, WONE, oracle };
}

describe("RecoveryVault", function () {
  it("should reject redeem if not whitelisted", async function () {
    const { outsider, token, vault } = await loadFixture(deployFixture);
    await token.connect(outsider).approve(vault.target, ethers.parseUnits("10", 18));
    await expect(
      vault.connect(outsider).redeem(token.target, ethers.parseUnits("10", 18), [])
    ).to.be.revertedWith("Not whitelisted");
  });

  it("should allow redeem if whitelisted with correct proof", async function () {
    const { user, token, vault, merkleTree, WONE } = await loadFixture(deployFixture);
    const proof = merkleTree.getHexProof(keccak256(user.address));
    await token.transfer(user.address, ethers.parseUnits("50", 18));
    await token.connect(user).approve(vault.target, ethers.parseUnits("50", 18));
    await time.increase(24 * 3600);
    await vault.startNewRound(1);
    await time.increase(24 * 3600); // delay round start

    await expect(vault.connect(user).redeem(token.target, ethers.parseUnits("50", 18), proof)).to.emit(
      vault,
      "RedeemProcessed"
    );
  });

  it("should enforce daily limit per wallet", async function () {
    const { user, token, vault, merkleTree } = await loadFixture(deployFixture);
    const proof = merkleTree.getHexProof(keccak256(user.address));
    await token.transfer(user.address, ethers.parseUnits("150", 18));
    await token.connect(user).approve(vault.target, ethers.parseUnits("150", 18));
    await time.increase(24 * 3600);
    await vault.startNewRound(1);
    await time.increase(24 * 3600);

    await vault.connect(user).redeem(token.target, ethers.parseUnits("90", 18), proof);
    await expect(
      vault.connect(user).redeem(token.target, ethers.parseUnits("20", 18), proof)
    ).to.be.revertedWith("Exceeds daily limit");
  });

  it("should reset limit after 24h", async function () {
    const { user, token, vault, merkleTree } = await loadFixture(deployFixture);
    const proof = merkleTree.getHexProof(keccak256(user.address));
    await token.transfer(user.address, ethers.parseUnits("100", 18));
    await token.connect(user).approve(vault.target, ethers.parseUnits("100", 18));
    await time.increase(24 * 3600);
    await vault.startNewRound(1);
    await time.increase(24 * 3600);

    await vault.connect(user).redeem(token.target, ethers.parseUnits("100", 18), proof);
    await time.increase(25 * 3600);
    await vault.connect(user).redeem(token.target, ethers.parseUnits("10", 18), proof);
  });

  it("should apply correct fee tier", async function () {
    const { user, token, vault, merkleTree, oracle } = await loadFixture(deployFixture);
    await oracle.setPrice(ethers.parseUnits("1", 18));
    const proof = merkleTree.getHexProof(keccak256(user.address));
    await token.transfer(user.address, ethers.parseUnits("300000", 18));
    await token.connect(user).approve(vault.target, ethers.MaxUint256);
    await time.increase(24 * 3600);
    await vault.startNewRound(1);
    await time.increase(24 * 3600);

    const tx = await vault.connect(user).redeem(token.target, ethers.parseUnits("300000", 18), proof);
    const receipt = await tx.wait();
    expect(receipt.logs.length).to.be.greaterThan(0);
  });

  it("should allow withdraw by owner only", async function () {
    const { owner, vault, rmc, WONE } = await loadFixture(deployFixture);
    const before = await WONE.balanceOf(rmc.address);
    await vault.withdrawFunds();
    const after = await WONE.balanceOf(rmc.address);
    expect(after).to.be.gt(before);
  });

  it("should transfer ownership", async function () {
    const { vault, outsider } = await loadFixture(deployFixture);
    await vault.transferOwnership(outsider.address);
    expect(await vault.owner()).to.equal(outsider.address);
  });

  it("should increment roundId correctly", async function () {
    const { vault } = await loadFixture(deployFixture);
    await time.increase(24 * 3600);
    await vault.startNewRound(1);
    expect(await vault.currentRound()).to.equal(1);
    await vault.startNewRound(2);
    expect(await vault.currentRound()).to.equal(2);
  });
});
