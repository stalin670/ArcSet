import "server-only";
import { formatUnits, isAddress, type Address } from "viem";
import {
  ARC_CONTRACTS,
  ARC_ERC20_BALANCE_ABI,
  ARC_TESTNET,
} from "@/lib/arc";
import { readArcWithFallback, type ArcServerClient } from "@/lib/arc-server-client";

export class ArcRpcUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Arc Testnet balance service is temporarily unavailable.", options);
    this.name = "ArcRpcUnavailableError";
  }
}

async function readArcErc20Balances(address: Address, options: { includeEurc: boolean; includeCirbtc: boolean }) {
  try {
    return await readArcWithFallback(async (client: ArcServerClient) => {
      const [usdc, eurc, cirbtc] = await Promise.all([
        client.readContract({
          address: ARC_CONTRACTS.usdc,
          abi: ARC_ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [address],
        }),
        options.includeEurc
          ? client.readContract({
              address: ARC_CONTRACTS.eurc,
              abi: ARC_ERC20_BALANCE_ABI,
              functionName: "balanceOf",
              args: [address],
            })
          : Promise.resolve(0n),
        options.includeCirbtc
          ? client.readContract({
              address: ARC_CONTRACTS.cirbtc,
              abi: ARC_ERC20_BALANCE_ABI,
              functionName: "balanceOf",
              args: [address],
            })
          : Promise.resolve(0n),
      ]);
      return { usdc, eurc, cirbtc };
    });
  } catch (error) {
    throw new ArcRpcUnavailableError({ cause: error });
  }
}

function validateAddress(address: string) {
  if (!isAddress(address, { strict: false })) {
    throw new TypeError("Invalid EVM wallet address.");
  }
  return address as Address;
}

export async function readArcUsdcBalance(address: string) {
  const walletAddress = validateAddress(address);
  const { usdc: rawBalance } = await readArcErc20Balances(walletAddress, { includeEurc: false, includeCirbtc: false });
  return {
    balance: formatUnits(rawBalance, 6),
    rawBalance: rawBalance.toString(),
    decimals: 6 as const,
    symbol: "USDC" as const,
    chainId: ARC_TESTNET.id,
  };
}

export async function readArcWalletAssets(address: string) {
  const walletAddress = validateAddress(address);
  const balances = await readArcErc20Balances(walletAddress, { includeEurc: true, includeCirbtc: true });
  return {
    address: walletAddress,
    chainId: ARC_TESTNET.id,
    asOf: Date.now(),
    assets: [
      { symbol: "USDC" as const, balance: formatUnits(balances.usdc, 6), rawBalance: balances.usdc.toString(), decimals: 6 as const },
      { symbol: "EURC" as const, balance: formatUnits(balances.eurc, 6), rawBalance: balances.eurc.toString(), decimals: 6 as const },
      { symbol: "cirBTC" as const, balance: formatUnits(balances.cirbtc, 8), rawBalance: balances.cirbtc.toString(), decimals: 8 as const },
    ],
  };
}
