import "server-only";

import { AppKit } from "@circle-fin/app-kit";
import { formatUnits, getAddress, isAddress } from "viem";
import { ARC_CONTRACTS } from "./arc";
import {
  selectLiveArcEarnVault,
  type ArcEarnPosition,
} from "./arc-earn-client";
import { readArcWithFallback } from "./arc-server-client";

const ARC_EARN_CHAIN = "Arc_Testnet" as const;

const ERC4626_POSITION_ABI = [
  { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "convertToAssets", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

type ServerEarnCandidate = {
  vaultAddress: string;
  chain: string;
  name: string;
  protocol: string;
  asset: string;
  assetAddress: string;
  currentApy: number;
  status: string;
  circleGuarded: boolean;
  warnings?: readonly { type: string; level: "YELLOW" | "RED" }[];
  riskSignals?: { warnings?: readonly { type: string; level: "YELLOW" | "RED" }[] };
};

export async function readArcEarnPosition(address: string): Promise<ArcEarnPosition> {
  if (!isAddress(address, { strict: false })) throw new TypeError("Invalid EVM wallet address.");
  const walletAddress = getAddress(address);
  const discovery = await new AppKit({ disableAnalytics: true, disableErrorReporting: true }).earn.exploreVaults({
    chain: ARC_EARN_CHAIN,
    asset: "USDC",
    sortBy: "tvl",
    pageSize: 100,
  });
  const candidate = selectLiveArcEarnVault(discovery.vaults as readonly ServerEarnCandidate[]);
  if (!candidate) throw new Error("No active non-mock USDC earn vault is available on Arc Testnet.");

  const vaultAddress = getAddress(candidate.vaultAddress);
  return readArcWithFallback(async (client) => {
    const [code, asset, shareDecimals, totalAssets, shares] = await Promise.all([
      client.getCode({ address: vaultAddress }),
      client.readContract({ address: vaultAddress, abi: ERC4626_POSITION_ABI, functionName: "asset" }),
      client.readContract({ address: vaultAddress, abi: ERC4626_POSITION_ABI, functionName: "decimals" }),
      client.readContract({ address: vaultAddress, abi: ERC4626_POSITION_ABI, functionName: "totalAssets" }),
      client.readContract({ address: vaultAddress, abi: ERC4626_POSITION_ABI, functionName: "balanceOf", args: [walletAddress] }),
    ]);
    if (!code || code === "0x") throw new Error("The discovered earn vault has no deployed bytecode.");
    if (asset.toLowerCase() !== ARC_CONTRACTS.usdc.toLowerCase()) {
      throw new Error("The discovered earn vault does not use official Arc USDC.");
    }
    const currentAssets = shares === 0n
      ? 0n
      : await client.readContract({
          address: vaultAddress,
          abi: ERC4626_POSITION_ABI,
          functionName: "convertToAssets",
          args: [shares],
        });
    const vault = {
      address: vaultAddress,
      name: candidate.name,
      protocol: candidate.protocol,
      asset: "USDC" as const,
      currentApy: candidate.currentApy,
      circleGuarded: candidate.circleGuarded,
      shareDecimals,
      totalAssets: formatUnits(totalAssets, 6),
    };
    return {
      vault,
      currentBalance: formatUnits(currentAssets, 6),
      shares: formatUnits(shares, shareDecimals),
      currentApy: candidate.currentApy,
      principalDeposited: null,
      totalYieldEarned: null,
    };
  });
}
