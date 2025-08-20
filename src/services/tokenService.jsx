// src/services/tokenService.jsx (ensureAllowance)
import { Contract, isAddress, MaxUint256 } from "ethers";
import ERC20_ABI from "@/ui/abi/ERC20.json";

export async function ensureAllowance(signer, token, owner, spender, minAmount) {
  if (![token, owner, spender].every(isAddress)) {
    throw new Error(`Invalid address param(s): token=${token} owner=${owner} spender=${spender}`);
  }
  const erc = new Contract(token, ERC20_ABI, signer);
  const current = await erc.allowance(owner, spender);
  if (current >= minAmount) return current;
  const tx = await erc.approve(spender, MaxUint256);
  console.log("[TokenService] approve tx:", tx.hash);
  return (await tx.wait()).hash;
}
