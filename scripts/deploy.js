#!/usr/bin/env node
// scripts/deploy.js
const { ethers, run } = require('hardhat');
const config = require('./config.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    console.error('❌ No deployer account found. Check network configuration.');
    process.exit(1);
  }
  const initialOwner = await deployer.getAddress();
  const devWallet = initialOwner;
  const rmcWallet = config.RECOVERY?.rmcWallet;
  const wONE = config.RECOVERY?.wONE;
  const peggedUSDC = config.RECOVERY?.peggedUSDC;
  const oracleAddress = config.RECOVERY?.oracle;
  const dailyLimitUsd = ethers.parseUnits(config.RECOVERY?.dailyLimitUsd || "100", 18);

  const rawTokens = config.RECOVERY?.supportedTokens || [];
  const supportedTokens = [...new Set(
    rawTokens.filter((addr) => {
      if (!addr) return false;
      const valid = ethers.isAddress(addr);
      if (!valid) console.warn(`⚠️ Invalid token skipped: ${addr}`);
      return valid;
    })
  )];
  if (!supportedTokens.length) {
    console.error('❌ No valid supported token addresses found. Aborting.');
    process.exit(1);
  }

  const Factory = await ethers.getContractFactory('RecoveryVault');

  let gasLimit;
  try {
    console.log("🚀 Deploying RecoveryVault with owner:", initialOwner);
    const deployTx = Factory.getDeployTransaction(
      initialOwner,
      devWallet,
      rmcWallet,
      wONE,
      peggedUSDC,
      supportedTokens,
      dailyLimitUsd,
      oracleAddress
    );
    const estimated = await deployer.estimateGas(deployTx);
    gasLimit = (estimated * 120n) / 100n; // 20% buffer
  } catch (err) {
    console.warn('⚠️ estimateGas failed or not supported, using fallback 5,000,000');
    gasLimit = 5000000n;
  }

  const vault = await Factory.deploy(
    initialOwner,
    devWallet,
    rmcWallet,
    wONE,
    peggedUSDC,
    supportedTokens,
    dailyLimitUsd,
    oracleAddress,
    { gasLimit }
  );
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  const network = await ethers.provider.getNetwork();
  console.log(`✅ Deployed RecoveryVault at ${address} on ${network.name} (chainId ${network.chainId})`);

  const confirmations = network.chainId === 1 ? 6 : 1;
  await (await vault.deploymentTransaction()).wait(confirmations);

  try {
    await run('verify:verify', {
      address,
      constructorArguments: [
        initialOwner,
        devWallet,
        rmcWallet,
        wONE,
        peggedUSDC,
        supportedTokens,
        dailyLimitUsd,
        oracleAddress
      ],
      contract: 'contracts/RecoveryVault.sol:RecoveryVault'
    });
    console.log('✅ Verification complete!');
  } catch (err) {
    console.warn('⚠️ Verification failed or skipped:', err.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
