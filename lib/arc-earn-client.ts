import type { EIP1193Provider } from "viem";
import { createPublicClient, custom, formatUnits, getAddress } from "viem";
import { ARC_CONTRACTS, ARC_TESTNET } from "./arc";

const ARC_EARN_CHAIN = "Arc_Testnet" as const;

const ERC4626_VERIFICATION_ABI = [
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type EarnVaultCandidate = {
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
  earnKitWarnings?: readonly string[];
  riskSignals?: {
    warnings?: readonly { type: string; level: "YELLOW" | "RED" }[];
    earnKitWarnings?: readonly string[];
  };
};

export type ArcEarnVault = {
  address: `0x${string}`;
  name: string;
  protocol: string;
  asset: "USDC";
  currentApy: number;
  circleGuarded: boolean;
  shareDecimals: number;
  totalAssets: string;
};

export type ArcEarnGasFee = {
  name: string;
  amountUsdc: string | null;
  error?: string;
};

export type ArcEarnDepositQuote = {
  kind: "deposit";
  vault: ArcEarnVault;
  amountIn: string;
  expectedShares: string;
  sharePrice: string;
  fees: { type: string; symbol: string; amount: string }[];
  gasFees: ArcEarnGasFee[];
  quotedAt: number;
};

export type ArcEarnWithdrawalQuote = {
  kind: "withdraw";
  vault: ArcEarnVault;
  amountOut: string;
  sharesToRedeem: string;
  maxWithdrawable: string;
  sharePrice: string;
  fees: { type: string; symbol: string; amount: string }[];
  gasFees: ArcEarnGasFee[];
  warnings: string[];
  quotedAt: number;
};

export type ArcEarnQuote = ArcEarnDepositQuote | ArcEarnWithdrawalQuote;

export type ArcEarnExecution = {
  kind: "deposit" | "withdraw";
  txHash: `0x${string}`;
  explorerUrl: string;
  vaultAddress: `0x${string}`;
  amount: string;
};

export type ArcEarnPosition = {
  vault: ArcEarnVault;
  currentBalance: string;
  shares: string;
  currentApy: number;
  principalDeposited: string | null;
  totalYieldEarned: string | null;
};

function amountString(value: { toString(): string }) {
  return value.toString();
}

function mapGasFees(gasFees: readonly {
  name: string;
  fees: { fee: string } | null;
  error?: string;
}[] | undefined): ArcEarnGasFee[] {
  return (gasFees ?? []).map((entry) => ({
    name: entry.name,
    amountUsdc: entry.fees ? formatUnits(BigInt(entry.fees.fee), 18) : null,
    error: entry.error,
  }));
}

export function selectLiveArcEarnVault(candidates: readonly EarnVaultCandidate[]) {
  return candidates.find((candidate) =>
    candidate.chain === ARC_EARN_CHAIN &&
    candidate.status === "active" &&
    candidate.asset.toUpperCase() === "USDC" &&
    candidate.assetAddress.toLowerCase() === ARC_CONTRACTS.usdc.toLowerCase() &&
    !candidate.name.toLowerCase().includes("mock") &&
    !candidate.warnings?.some((warning) => warning.level === "RED") &&
    !candidate.riskSignals?.warnings?.some((warning) => warning.level === "RED") &&
    Number.isFinite(candidate.currentApy) &&
    candidate.currentApy >= 0,
  ) ?? null;
}

async function createEarnContext(provider: EIP1193Provider) {
  const [{ AppKit }, { createViemAdapterFromProvider }] = await Promise.all([
    import("@circle-fin/app-kit"),
    import("@circle-fin/adapter-viem-v2"),
  ]);
  const adapter = await createViemAdapterFromProvider({ provider });
  return {
    kit: new AppKit({ disableAnalytics: true, disableErrorReporting: true }),
    adapter,
    publicClient: createPublicClient({ chain: ARC_TESTNET, transport: custom(provider) }),
  };
}

async function discoverVerifiedVault(
  context: Awaited<ReturnType<typeof createEarnContext>>,
): Promise<ArcEarnVault> {
  const discovery = await context.kit.earn.exploreVaults({
    chain: ARC_EARN_CHAIN,
    asset: "USDC",
    sortBy: "tvl",
    pageSize: 100,
  });
  const candidate = selectLiveArcEarnVault(discovery.vaults as readonly EarnVaultCandidate[]);
  if (!candidate) {
    throw new Error("No active non-mock USDC earn vault is available on Arc Testnet.");
  }

  const address = getAddress(candidate.vaultAddress);
  const code = await context.publicClient.getCode({ address });
  if (!code || code === "0x") throw new Error("The discovered earn vault has no deployed bytecode.");

  const [asset, shareDecimals, totalAssets] = await Promise.all([
    context.publicClient.readContract({ address, abi: ERC4626_VERIFICATION_ABI, functionName: "asset" }),
    context.publicClient.readContract({ address, abi: ERC4626_VERIFICATION_ABI, functionName: "decimals" }),
    context.publicClient.readContract({ address, abi: ERC4626_VERIFICATION_ABI, functionName: "totalAssets" }),
  ]);
  if (asset.toLowerCase() !== ARC_CONTRACTS.usdc.toLowerCase()) {
    throw new Error("The discovered earn vault does not use the official Arc USDC asset.");
  }

  return {
    address,
    name: candidate.name,
    protocol: candidate.protocol,
    asset: "USDC",
    currentApy: candidate.currentApy,
    circleGuarded: candidate.circleGuarded,
    shareDecimals,
    totalAssets: formatUnits(totalAssets, 6),
  };
}

export async function getArcEarnPosition(address: string): Promise<ArcEarnPosition> {
  const response = await fetch(`/api/wallets/${address}/earn-position`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json() as ArcEarnPosition | { error: string };
  if (!response.ok || "error" in payload) throw new Error("Couldn’t load the Arc earn position.");
  return payload;
}

export async function quoteArcEarnDeposit(provider: EIP1193Provider, amountIn: string): Promise<ArcEarnDepositQuote> {
  const context = await createEarnContext(provider);
  const vault = await discoverVerifiedVault(context);
  const quote = await context.kit.earn.getDepositQuote({
    from: { adapter: context.adapter, chain: ARC_EARN_CHAIN },
    vaultAddress: vault.address,
    amount: amountIn,
  });
  if (quote.vaultAddress.toLowerCase() !== vault.address.toLowerCase()) {
    throw new Error("The earn quote returned a different vault address.");
  }
  return {
    kind: "deposit",
    vault,
    amountIn: amountString(quote.deposit.amount),
    expectedShares: amountString(quote.expectedShares.amount),
    sharePrice: quote.sharePrice,
    fees: quote.fees.map((fee) => ({ type: fee.type ?? "provider", symbol: fee.symbol, amount: amountString(fee.amount) })),
    gasFees: mapGasFees(quote.gasFees),
    quotedAt: Date.now(),
  };
}

export async function quoteArcEarnWithdrawal(provider: EIP1193Provider, amountOut: string): Promise<ArcEarnWithdrawalQuote> {
  const context = await createEarnContext(provider);
  const vault = await discoverVerifiedVault(context);
  const quote = await context.kit.earn.getWithdrawalQuote({
    from: { adapter: context.adapter, chain: ARC_EARN_CHAIN },
    vaultAddress: vault.address,
    amount: amountOut,
  });
  if (quote.vaultAddress.toLowerCase() !== vault.address.toLowerCase()) {
    throw new Error("The earn quote returned a different vault address.");
  }
  return {
    kind: "withdraw",
    vault,
    amountOut: amountString(quote.withdrawal.amount),
    sharesToRedeem: amountString(quote.sharesToRedeem.amount),
    maxWithdrawable: amountString(quote.maxWithdrawable.amount),
    sharePrice: quote.sharePrice,
    fees: quote.fees.map((fee) => ({ type: fee.type ?? "provider", symbol: fee.symbol, amount: amountString(fee.amount) })),
    gasFees: mapGasFees(quote.gasFees),
    warnings: [...(quote.earnKitWarnings ?? [])],
    quotedAt: Date.now(),
  };
}

export async function executeArcEarnQuote(provider: EIP1193Provider, quote: ArcEarnQuote): Promise<ArcEarnExecution> {
  const context = await createEarnContext(provider);
  const vault = await discoverVerifiedVault(context);
  if (vault.address.toLowerCase() !== quote.vault.address.toLowerCase()) {
    throw new Error("The active earn vault changed. Request a new quote before signing.");
  }

  const result = quote.kind === "deposit"
    ? await context.kit.earn.deposit({
        from: { adapter: context.adapter, chain: ARC_EARN_CHAIN },
        vaultAddress: vault.address,
        amount: quote.amountIn,
      })
    : await context.kit.earn.withdraw({
        from: { adapter: context.adapter, chain: ARC_EARN_CHAIN },
        vaultAddress: vault.address,
        amount: quote.amountOut,
      });

  return {
    kind: quote.kind,
    txHash: result.txHash as `0x${string}`,
    explorerUrl: result.explorerUrl,
    vaultAddress: getAddress(result.vaultAddress),
    amount: result.amount,
  };
}
