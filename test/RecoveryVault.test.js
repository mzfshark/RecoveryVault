const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

/**
 * Generates a merkle tree from a list of addresses
 */
function generateMerkleTree(addresses) {
  const leaves = addresses.map(addr => keccak256(addr));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = tree.getHexRoot();
  return { tree, root };
}

describe("RecoveryVault", function () {
  async function deployFixture() {
    const [owner, user1, user2, dev, rmc] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("ERC20Mock");
    const token = await MockERC20.deploy("MockToken", "MTK", 18);
    await token.mint(user1.address, ethers.parseUnits("1000", 18));
    await token.mint(owner.address, ethers.parseUnits("1000", 18));
    await token.mint(user2.address, ethers.parseUnits("1000", 18));

    const MockOracle = await ethers.getContractFactory("MockOracle");
    const oracle = await MockOracle.deploy(ethers.parseUnits("82", 18));

    const users = [user1.address, user2.address];
    const { tree, root } = generateMerkleTree(users);

    const RecoveryVault = await ethers.getContractFactory("RecoveryVault");
    const vault = await RecoveryVault.deploy(
      owner.address,
      dev.address,
      rmc.address,
      [token.target],
      ethers.parseUnits("100", 18),
      oracle.target
    );

    await token.connect(owner).transfer(vault.target, ethers.parseUnits("100", 18));
    await owner.sendTransaction({ to: vault.target, value: ethers.parseEther("100") });

    await vault.setMerkleRoot(root);
    await token.connect(user1).approve(vault.target, ethers.MaxUint256);

    return { vault, token, user1, user2, dev, rmc, oracle, root, tree };
  }

  it("should reject redeem if not whitelisted", async function () {
    const { vault, token, user2 } = await loadFixture(deployFixture);
    await token.connect(user2).transfer(vault.target, ethers.parseUnits("100", 18));
    await time.increase(86401);
    await vault.startNewRound(1);
    await expect(
      vault.connect(user2).redeem(token.target, ethers.parseUnits("10", 18), [])
    ).to.be.revertedWith("Not whitelisted");
  });

  it("should allow redeem if whitelisted with correct proof", async function () {
    const { vault, token, user1, tree } = await loadFixture(deployFixture);
    const proof = tree.getHexProof(keccak256(user1.address));

    await token.connect(user1).transfer(vault.target, ethers.parseUnits("100", 18));
    await time.increase(86401);
    await vault.startNewRound(1);
    await time.increase(86401);

    await expect(
      vault.connect(user1).redeem(token.target, ethers.parseUnits("10", 18), proof)
    ).to.emit(vault, "RedeemProcessed");
  });

  it("should enforce daily limit per wallet", async function () {
    const { vault, token, user1, tree } = await loadFixture(deployFixture);
    const proof = tree.getHexProof(keccak256(user1.address));

    await token.connect(user1).transfer(vault.target, ethers.parseUnits("100", 18));
    await time.increase(86401);
    await vault.startNewRound(2);
    await time.increase(86401);

    const limit = ethers.parseUnits("100", 18);
    await expect(
      vault.connect(user1).redeem(token.target, limit.add(1), proof)
    ).to.be.revertedWith("Exceeds daily limit");
  });

  it("should reset limit after 24h", async function () {
    const { vault, token, user1, tree } = await loadFixture(deployFixture);
    const proof = tree.getHexProof(keccak256(user1.address));

    await token.connect(user1).transfer(vault.target, ethers.parseUnits("100", 18));
    await time.increase(86401);
    await vault.startNewRound(3);
    await time.increase(86401);

    const amount = ethers.parseUnits("50", 18);
    await vault.connect(user1).redeem(token.target, amount, proof);
    await time.increase(86401);
    await vault.connect(user1).redeem(token.target, amount, proof);
  });

  it("should apply correct fee tier", async function () {
    const { vault, token, user1, tree } = await loadFixture(deployFixture);
    const proof = tree.getHexProof(keccak256(user1.address));

    await token.connect(user1).transfer(vault.target, ethers.parseUnits("100", 18));
    await time.increase(86401);
    await vault.startNewRound(4);
    await time.increase(86401);

    await expect(
      vault.connect(user1).redeem(token.target, ethers.parseUnits("10", 18), proof)
    ).to.emit(vault, "BurnToken");
  });

  it("should allow withdraw by owner only", async function () {
    const { vault, token, user1 } = await loadFixture(deployFixture);

    await expect(vault.connect(user1).withdrawFunds()).to.be.reverted;
  });

  it("should transfer ownership", async function () {
    const { vault, user1 } = await loadFixture(deployFixture);
    await vault.transferOwnership(user1.address);
    expect(await vault.owner()).to.equal(user1.address);
  });

  it("should increment roundId correctly", async function () {
    const { vault, token, user1 } = await loadFixture(deployFixture);
    await token.connect(user1).transfer(vault.target, ethers.parseUnits("100", 18));
    await time.increase(86401);
    await vault.startNewRound(5);
    expect(await vault.currentRound()).to.equal(5);
  });
});
