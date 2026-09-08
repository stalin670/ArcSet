import { createPublicClient, custom, type EIP1193Provider } from "viem";
import { ARC_TESTNET } from "./arc";

export const RESERVE_CURRENCY_SLIPPAGE_BPS = 100;
export type ArcSwapOutputToken = "EURC" | "cirBTC";
export type ArcSwapToken = "USDC" | ArcSwapOutputToken;

export type ArcSwapFee = {
  type: string;
  token: string;
  amount: string | null;
};

export type ArcSwapQuote = {
  amountIn: string;
  inputToken: ArcSwapToken;
  estimatedOutput: string;
  outputToken: ArcSwapToken;
  minimumOutput: string;
  fees: ArcSwapFee[];
  slippageBps: number;
  quotedAt: number;
};

export type ArcSwapExecution = {
  txHash: string;
  explorerUrl?: string;
  amountIn: string;
  inputToken: ArcSwapToken;
  amountOut?: string;
  outputToken: ArcSwapToken;
  status: string;
};

async function createSwapContext(provider: EIP1193Provider) {
  const [{ AppKit }, { createViemAdapterFromProvider }] = await Promise.all([
    import("@circle-fin/app-kit"),
    import("@circle-fin/adapter-viem-v2"),
  ]);
  const adapter = await createViemAdapterFromProvider({ provider });
  return { kit: new AppKit(), adapter };
}

export function arcSwapConfig(slippageBps: number) {
  return { allowanceStrategy: "approve" as const, batchTransactions: true, slippageBps };
}

export function normalizeArcSwapOutputToken(token: string): ArcSwapOutputToken {
  const normalized = token.toUpperCase();
  if (normalized === "EURC") return "EURC";
  if (normalized === "CIRBTC") return "cirBTC";
  throw new Error(`Unsupported Arc swap output token: ${token}`);
}

export function normalizeArcSwapToken(token: string): ArcSwapToken {
  if (token.toUpperCase() === "USDC") return "USDC";
  return normalizeArcSwapOutputToken(token);
}

export async function quoteTokenSwap(
  provider: EIP1193Provider,
  inputToken: ArcSwapToken,
  outputToken: ArcSwapToken,
  amountIn: string,
  slippageBps = RESERVE_CURRENCY_SLIPPAGE_BPS,
): Promise<ArcSwapQuote> {
  if (inputToken === outputToken) throw new Error("A swap requires two different Arc assets.");
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 1_000) throw new Error("Swap slippage must be between 1 and 1,000 basis points.");
  const { kit, adapter } = await createSwapContext(provider);
  const estimate = await kit.estimateSwap({
    from: { adapter, chain: "Arc_Testnet" },
    tokenIn: inputToken,
    tokenOut: outputToken,
    amountIn,
    config: arcSwapConfig(slippageBps),
  });
  const normalizedOutput = normalizeArcSwapToken(estimate.estimatedOutput.token);
  if (normalizedOutput !== outputToken) throw new Error("The Arc swap quote returned an unexpected output token.");
  return {
    amountIn: estimate.amountIn,
    inputToken,
    estimatedOutput: estimate.estimatedOutput.amount,
    outputToken: normalizedOutput,
    minimumOutput: estimate.stopLimit.amount,
    fees: (estimate.fees ?? []).map((fee) => ({ type: fee.type, token: fee.token, amount: fee.amount })),
    slippageBps,
    quotedAt: Date.now(),
  };
}

export async function executeTokenSwap(provider: EIP1193Provider, quote: ArcSwapQuote): Promise<ArcSwapExecution> {
  const { kit, adapter } = await createSwapContext(provider);
  const result = await kit.swap({
    from: { adapter, chain: "Arc_Testnet" },
    tokenIn: quote.inputToken,
    tokenOut: quote.outputToken,
    amountIn: quote.amountIn,
    // Explicit approvals keep the reviewed spend boundary visible and avoid
    // the permit-to-approval fallback. App Kit derives the execution minimum
    // from the same relative tolerance shown in the reviewed quote.
    config: arcSwapConfig(quote.slippageBps),
  });
  let status = result.progress.status;
  if (status !== "DONE") {
    try {
      const receipt = await createPublicClient({ chain: ARC_TESTNET, transport: custom(provider) }).waitForTransactionReceipt({
        hash: result.txHash as `0x${string}`,
        confirmations: 1,
        pollingInterval: 500,
        timeout: 15_000,
      });
      if (receipt.status === "reverted") throw new Error("The Arc swap transaction reverted.");
      status = "DONE";
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("revert")) throw error;
      // Preserve the submitted transaction hash. The Portfolio reconciler will
      // resolve it through the independent Arc receipt endpoint after reload.
    }
  }
  return {
    txHash: result.txHash,
    explorerUrl: result.explorerUrl,
    amountIn: quote.amountIn,
    inputToken: quote.inputToken,
    amountOut: result.amountOut,
    outputToken: quote.outputToken,
    status,
  };
}

export async function quoteUsdcToToken(
  provider: EIP1193Provider,
  outputToken: ArcSwapOutputToken,
  amountIn: string,
  slippageBps = RESERVE_CURRENCY_SLIPPAGE_BPS,
): Promise<ArcSwapQuote> {
  return quoteTokenSwap(provider, "USDC", outputToken, amountIn, slippageBps);
}

export async function executeUsdcToToken(
  provider: EIP1193Provider,
  quote: ArcSwapQuote,
): Promise<ArcSwapExecution> {
  if (quote.inputToken !== "USDC") throw new Error("Expected a USDC-funded Arc swap quote.");
  return executeTokenSwap(provider, quote);
}

export function quoteUsdcToEurc(provider: EIP1193Provider, amountIn: string) {
  return quoteUsdcToToken(provider, "EURC", amountIn);
}

export function executeUsdcToEurc(provider: EIP1193Provider, quote: ArcSwapQuote) {
  if (quote.outputToken !== "EURC") throw new Error("Expected an EURC swap quote.");
  return executeUsdcToToken(provider, quote);
}
