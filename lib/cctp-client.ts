import { formatUnits, parseUnits, type EIP1193Provider } from "viem";
import type { BridgeEstimateResult, BridgeResult, ReceiveExactEstimateResult } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";

export type CctpDirection = "arc-to-base" | "base-to-arc";
export const ARC_CCTP_MIN_TRANSFER_USDC = "1.5";

export function validateCctpTransferAmount(direction: CctpDirection, amount: string) {
  const raw = parseUnits(amount, 6);
  if (raw <= 0n) throw new Error("Enter a positive CCTP transfer amount.");
  if (direction === "arc-to-base" && raw < parseUnits(ARC_CCTP_MIN_TRANSFER_USDC, 6)) {
    throw new Error(`Arc CCTP requires at least ${ARC_CCTP_MIN_TRANSFER_USDC} USDC so its maximum fee remains below the transfer amount.`);
  }
}

export type CctpBridgeQuote = {
  direction: CctpDirection;
  transferAmount: string;
  amountReceived: string;
  totalDebit: string;
  feeTotal: string;
  feeItems: readonly { type: string; amount: string }[];
  gasFees: readonly { name: string; token: string; amount: string | null }[];
  quote: string | null;
  quotedAt: number;
  expiry: ReceiveExactEstimateResult["quoteExpiry"] | null;
  recipientAddress: `0x${string}`;
};

function isReceiveExactEstimate(estimate: BridgeEstimateResult): estimate is ReceiveExactEstimateResult {
  return typeof (estimate as Partial<ReceiveExactEstimateResult>).amountReceived === "string";
}

function bridgeChains(direction: CctpDirection) {
  return direction === "arc-to-base"
    ? { from: "Arc_Testnet" as const, to: "Base_Sepolia" as const }
    : { from: "Base_Sepolia" as const, to: "Arc_Testnet" as const };
}

async function bridgeContext(provider: EIP1193Provider) {
  const { AppKit } = await import("@circle-fin/app-kit");
  return {
    kit: new AppKit({ disableAnalytics: true, disableErrorReporting: true }),
    adapter: await createViemAdapterFromProvider({ provider }),
  };
}

function params(
  adapter: Awaited<ReturnType<typeof createViemAdapterFromProvider>>,
  direction: CctpDirection,
  recipientAddress: `0x${string}`,
  amount: string,
  quote?: string | null,
) {
  const chains = bridgeChains(direction);
  return {
    from: { adapter, chain: chains.from },
    to: { chain: chains.to, recipientAddress, useForwarder: true as const },
    amount,
    token: "USDC" as const,
    config: direction === "arc-to-base"
      ? { transferSpeed: "SLOW" as const, batchTransactions: true }
      : { transferSpeed: "SLOW" as const, feePayment: "source" as const, batchTransactions: true },
    ...(quote ? { quote } : {}),
  };
}

export async function quoteCctpBridge(
  provider: EIP1193Provider,
  direction: CctpDirection,
  recipientAddress: `0x${string}`,
  amount: string,
): Promise<CctpBridgeQuote> {
  validateCctpTransferAmount(direction, amount);
  const { kit, adapter } = await bridgeContext(provider);
  const estimate = await kit.estimateBridge(params(adapter, direction, recipientAddress, amount));
  const receiveExact = isReceiveExactEstimate(estimate);
  const fallbackFees = estimate.fees.flatMap((fee) => fee.amount ? [fee.amount] : []);
  const feeTotal = receiveExact
    ? estimate.feeTotal
    : formatFeeTotal(fallbackFees);
  const amountReceived = receiveExact
    ? estimate.amountReceived
    : subtractFeeTotal(amount, feeTotal);
  return {
    direction,
    transferAmount: amount,
    amountReceived,
    totalDebit: receiveExact ? estimate.totalDebit : amount,
    feeTotal,
    feeItems: receiveExact
      ? estimate.feeItems.map(({ type, amount: feeAmount }) => ({ type, amount: feeAmount }))
      : estimate.fees.flatMap((fee) => fee.amount ? [{ type: fee.type, amount: fee.amount }] : []),
    gasFees: estimate.gasFees.map((fee) => ({
      name: fee.name,
      token: fee.token,
      amount: fee.fees?.fee ?? null,
    })),
    quote: receiveExact ? estimate.quote : null,
    quotedAt: Date.now(),
    expiry: receiveExact ? estimate.quoteExpiry : null,
    recipientAddress,
  };
}

export async function executeCctpBridge(
  provider: EIP1193Provider,
  quote: CctpBridgeQuote,
): Promise<BridgeResult> {
  const { kit, adapter } = await bridgeContext(provider);
  return kit.bridge(params(
    adapter,
    quote.direction,
    quote.recipientAddress,
    quote.transferAmount,
    quote.quote,
  ));
}

function formatFeeTotal(fees: string[]) {
  const total = fees.reduce((sum, fee) => sum + parseUnits(fee, 6), 0n);
  return formatUnits(total, 6);
}

function subtractFeeTotal(amount: string, fees: string) {
  const received = parseUnits(amount, 6) - parseUnits(fees, 6);
  if (received <= 0n) throw new Error("The CCTP forwarding fee is greater than the transfer amount.");
  return formatUnits(received, 6);
}

export async function retryCctpBridge(
  provider: EIP1193Provider,
  result: BridgeResult,
): Promise<BridgeResult> {
  const { kit, adapter } = await bridgeContext(provider);
  return kit.retryBridge(result, { from: adapter });
}

export function bridgeTransactionSteps(result: BridgeResult) {
  return result.steps.filter((step): step is typeof step & { txHash: string } => Boolean(step.txHash));
}
