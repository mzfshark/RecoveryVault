// scripts/setMerkleProof.js
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using deployer:", deployer.address);

  const vaultAddress = process.env.VAULT_ADDRESS;
  if (!vaultAddress) {
    throw new Error("Please set VAULT_ADDRESS in your .env file");
  }

  const proofsPath = path.join(__dirname, "../data/proofs.json");
  if (!fs.existsSync(proofsPath)) {
    throw new Error("proofs.json not found in /data");
  }

  const proofs = JSON.parse(fs.readFileSync(proofsPath));
  const root = proofs.merkleRoot;

  const RecoveryVault = await ethers.getContractAt("RecoveryVault", vaultAddress);
  const tx = await RecoveryVault.connect(deployer).setMerkleRoot(root);
  await tx.wait();

  console.log("Merkle root set to:", root);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
