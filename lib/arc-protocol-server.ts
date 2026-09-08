import "server-only";
import { formatUnits } from "viem";
import { ARC_CONTRACTS, ARC_TESTNET } from "@/lib/arc";
import { readArcWithFallback } from "@/lib/arc-server-client";

const ERC4626_STATUS_ABI = [
  { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const SINGLE_STRATEGY_ABI = [
  { type: "function", name: "strategy", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

export type ArcProtocolHealth = {
  chainId: number;
  blockNumber: string;
  checkedAt: number;
  rpcProvider: string;
  morpho: {
    status: "ready";
    vaultAddress: `0x${string}`;
    assetAddress: `0x${string}`;
    totalAssets: string;
    totalShares: string;
    shareDecimals: number;
  };
  xylo: {
    status: "indexed-candidate";
    vaultAddress: `0x${string}`;
    assetAddress: `0x${string}`;
    totalAssets: string;
    totalShares: string;
    shareDecimals: number;
    strategyAddress: `0x${string}`;
    strategyActive: boolean;
    eligibleForInvestment: false;
  };
};

export async function readArcProtocolHealth(): Promise<ArcProtocolHealth> {
  return readArcWithFallback(async (client, rpcProvider) => {
    const vaultAddress = ARC_CONTRACTS.morphoUsdcVault;
    const xyloVaultAddress = ARC_CONTRACTS.xyloUsdcVault;
    const [blockNumber, bytecode, assetAddress, totalAssets, totalShares, shareDecimals, xyloBytecode, xyloAssetAddress, xyloTotalAssets, xyloTotalShares, xyloShareDecimals, xyloStrategyAddress] = await Promise.all([
      client.getBlockNumber(),
      client.getCode({ address: vaultAddress }),
      client.readContract({ address: vaultAddress, abi: ERC4626_STATUS_ABI, functionName: "asset" }),
      client.readContract({ address: vaultAddress, abi: ERC4626_STATUS_ABI, functionName: "totalAssets" }),
      client.readContract({ address: vaultAddress, abi: ERC4626_STATUS_ABI, functionName: "totalSupply" }),
      client.readContract({ address: vaultAddress, abi: ERC4626_STATUS_ABI, functionName: "decimals" }),
      client.getCode({ address: xyloVaultAddress }),
      client.readContract({ address: xyloVaultAddress, abi: ERC4626_STATUS_ABI, functionName: "asset" }),
      client.readContract({ address: xyloVaultAddress, abi: ERC4626_STATUS_ABI, functionName: "totalAssets" }),
      client.readContract({ address: xyloVaultAddress, abi: ERC4626_STATUS_ABI, functionName: "totalSupply" }),
      client.readContract({ address: xyloVaultAddress, abi: ERC4626_STATUS_ABI, functionName: "decimals" }),
      client.readContract({ address: xyloVaultAddress, abi: SINGLE_STRATEGY_ABI, functionName: "strategy" }),
    ]);

    if (!bytecode || bytecode === "0x") throw new Error("The configured Morpho vault has no bytecode.");
    if (assetAddress.toLowerCase() !== ARC_CONTRACTS.usdc.toLowerCase()) {
      throw new Error("The configured Morpho vault does not use Arc USDC.");
    }
    if (!xyloBytecode || xyloBytecode === "0x") throw new Error("The configured Xylo vault has no bytecode.");
    if (xyloAssetAddress.toLowerCase() !== ARC_CONTRACTS.usdc.toLowerCase()) {
      throw new Error("The configured Xylo vault does not use Arc USDC.");
    }

    return {
      chainId: ARC_TESTNET.id,
      blockNumber: blockNumber.toString(),
      checkedAt: Date.now(),
      rpcProvider: new URL(rpcProvider).host,
      morpho: {
        status: "ready",
        vaultAddress,
        assetAddress,
        totalAssets: formatUnits(totalAssets, 6),
        totalShares: formatUnits(totalShares, shareDecimals),
        shareDecimals,
      },
      xylo: {
        status: "indexed-candidate",
        vaultAddress: xyloVaultAddress,
        assetAddress: xyloAssetAddress,
        totalAssets: formatUnits(xyloTotalAssets, 6),
        totalShares: formatUnits(xyloTotalShares, xyloShareDecimals),
        shareDecimals: xyloShareDecimals,
        strategyAddress: xyloStrategyAddress,
        strategyActive: xyloStrategyAddress !== "0x0000000000000000000000000000000000000000",
        eligibleForInvestment: false,
      },
    };
  });
}
