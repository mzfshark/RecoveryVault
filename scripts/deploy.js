const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const initialOwner = process.env.INITIAL_OWNER;
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with:", deployer.address);

  // Configuration
  const devWallet = process.env.DEV_WALLET;
  const rmcWallet = process.env.RMC_WALLET_ADDRESS;

  // Supported depegged tokens
  const supportedTokens = [
    "0x985458E523dB3d53125813eD68c274899e9DfAb4", // aUSDC
    "0x3C2B8Be99c50593081EAA2A724F0B8285F5aba8f", // aUSDT
    "0x6983D1E6DEf3690C4d616b13597A09e6193EA013", // aWETH
    "0xE176EBE47d621b984a73036B9DA5d834411ef734", // aBUSD
    "0x0aB43550A6915F9f67d0c454C2E90385E6497EaA", // bscBUSD
    "0x3095c7557bCb296ccc6e363DE01b760bA031F2d9", // aWBTC
    "0xEf977d2f931C1978Db5F6747666fa1eACB0d0339", // aDAI
  ];

  const dailyLimitUsd = ethers.parseUnits("100", 18); // $100 limit per day
  const oracleAddress = process.env.HARMONY_ORACLE; // Band oracle

  const wONE = "0xcF664087a5bB0237a0BAd6742852ec6c8d69A27a";
  const peggedUSDC = "0xBC594CABd205bD993e7FfA6F3e9ceA75c1110da5";

  const RecoveryVault = await ethers.getContractFactory("RecoveryVault");
  const vault = await RecoveryVault.deploy(
    initialOwner,
    devWallet,
    rmcWallet,
    wONE,
    peggedUSDC,
    supportedTokens,
    dailyLimitUsd,
    oracleAddress
  );

  await vault.waitForDeployment();

  console.log("RecoveryVault deployed to:", vault.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
