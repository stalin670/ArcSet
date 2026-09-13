import type { BridgeResult } from "@circle-fin/app-kit";
import { formatUnits, parseUnits, type EIP1193Provider } from "viem";
import { executeArcEarnQuote, quoteArcEarnDeposit, type ArcEarnDepositQuote } from "./arc-earn-client";
import { executeBaseUniswapSwap, mintBaseWideRangePosition, quoteBaseUniswapSwap, readBaseWalletPreflight, removeBaseWideRangePosition, type BaseLpExecution, type BaseSwapQuote } from "./base-uniswap-client";
import { bridgeTransactionSteps, executeCctpBridge, quoteCctpBridge, retryCctpBridge, type CctpBridgeQuote } from "./cctp-client";
import { saveCrossChainPosition, type CrossChainBasketPosition } from "./cross-chain-positions";
import { assertRouteCurrent, routeJournal, withRouteLock, type RouteRecord } from "./cross-chain-route";

export type EntryPlan = {
  earn: ArcEarnDepositQuote; bridge: CctpBridgeQuote; swap: BaseSwapQuote;
  total: string; morpho: string; base: string; retained: string; swapUsdc: string; baseStartingUsdc: string;
  basketVersion: number;
};
export type ExitQuote = { expectedUsdc: string; expectedWeth: string; swapMinimum: string; estimatedReturn: string; bridgeFee: string };
export type ExitPlan = { position: CrossChainBasketPosition; quote: ExitQuote };
type Wallet = { provider: () => Promise<EIP1193Provider>; switchToArc: () => Promise<unknown>; switchToBase: () => Promise<unknown> };
const clients = { executeArcEarnQuote, quoteArcEarnDeposit, executeBaseUniswapSwap, mintBaseWideRangePosition, quoteBaseUniswapSwap, readBaseWalletPreflight, removeBaseWideRangePosition, executeCctpBridge, quoteCctpBridge, retryCctpBridge, saveCrossChainPosition };
export type RouteClients = typeof clients;

export function subtractReturnFee(amount: string, fee: string) {
  const available = parseUnits(amount, 6) - parseUnits(fee, 6) - 10_000n;
  if (available <= 0n) throw new Error("The position is too small to cover the return bridge fee.");
  return formatUnits(available, 6);
}

async function bridge<P>(record: RouteRecord<P>, journal: ReturnType<typeof routeJournal<P>>, provider: EIP1193Provider, quote: () => Promise<CctpBridgeQuote>, deps: RouteClients) {
  // Each returned Circle result, including partial burns, is durable before retry.
  let result = await journal.preparedStep("bridge", async () => {
    const fresh = await quote();
    record.results["bridge quote"] = fresh;
    journal.checkpoint();
    return fresh;
  }, (fresh) => deps.executeCctpBridge(provider, fresh));
  let attempt = 1;
  while (Object.hasOwn(record.results, `bridge retry ${attempt}`)) {
    result = record.results[`bridge retry ${attempt}`] as BridgeResult;
    attempt += 1;
  }
  if (result.state !== "success") result = await journal.step(`bridge retry ${attempt}`, () => deps.retryCctpBridge(provider, result));
  if (result.state !== "success") throw new Error("CCTP paused. Its recorded result will be used to resume the bridge.");
  return result;
}

async function checkedProvider(wallet: Wallet, address: string) {
  const provider = await wallet.provider();
  const accounts = await provider.request({ method: "eth_accounts" });
  if (!accounts[0] || accounts[0].toLowerCase() !== address.toLowerCase()) {
    throw new Error("The connected wallet changed. Reconnect the wallet that started this route.");
  }
  return provider;
}

export async function executeEntryRoute(record: RouteRecord<EntryPlan>, wallet: Wallet, onStage: (stage: number) => void, deps: RouteClients = clients): Promise<BaseLpExecution> {
  return withRouteLock(record.wallet, async () => {
    assertRouteCurrent(record);
    const journal = routeJournal(record);
    const plan = record.plan;
    await wallet.switchToArc();
    let provider = await checkedProvider(wallet, record.wallet);
    const earn = await journal.preparedStep("Morpho deposit", () => deps.quoteArcEarnDeposit(provider, plan.morpho), (fresh) => deps.executeArcEarnQuote(provider, fresh));
    onStage(1);
    const bridged = await bridge(record, journal, provider, async () => {
      const balance = await deps.readBaseWalletPreflight(record.baseWallet as `0x${string}`);
      record.results["Base starting USDC"] = balance.usdc;
      const fresh = await deps.quoteCctpBridge(provider, "arc-to-base", record.baseWallet as `0x${string}`, plan.base);
      if (parseUnits(fresh.totalDebit, 6) + parseUnits(plan.morpho, 6) > parseUnits(plan.total, 6)) {
        throw new Error("The refreshed bridge fee exceeds this route's budget. Resume when fees fall.");
      }
      return fresh;
    }, deps);
    // Balance observation is read-only and can safely be retried after reload.
    let received = record.results.received as string | undefined;
    if (!received) {
      const balance = await deps.readBaseWalletPreflight(record.baseWallet as `0x${string}`);
      const delta = parseUnits(balance.usdc, 6) - parseUnits((record.results["Base starting USDC"] as string | undefined) ?? plan.baseStartingUsdc, 6);
      if (delta <= 0n) throw new Error("CCTP completed but its Base USDC receipt is not visible yet. Resume after confirmation.");
      const expected = parseUnits(((record.results["bridge quote"] as CctpBridgeQuote | undefined) ?? plan.bridge).amountReceived, 6);
      if (delta < expected) throw new Error("The full Base USDC receipt is not visible yet. Resume after confirmation.");
      // Never sweep unrelated Base deposits into this route.
      received = formatUnits(expected, 6);
      record.results.received = received;
      journal.checkpoint();
    }
    onStage(2);
    await wallet.switchToBase();
    provider = await checkedProvider(wallet, record.baseWallet);
    const half = formatUnits(parseUnits(received, 6) / 2n, 6);
    const swapped = await journal.preparedStep("Base swap", () => deps.quoteBaseUniswapSwap(half), (fresh) => deps.executeBaseUniswapSwap(provider, fresh));
    onStage(3);
    const remaining = formatUnits(parseUnits(received, 6) - parseUnits(half, 6), 6);
    const lp = await journal.step("LP mint", () => deps.mintBaseWideRangePosition(provider, remaining, swapped.amountOut));
    onStage(4);
    const bridgeDebit = ((record.results["bridge quote"] as CctpBridgeQuote | undefined) ?? plan.bridge).totalDebit;
    const retained = formatUnits(parseUnits(plan.total, 6) - parseUnits(plan.morpho, 6) - parseUnits(bridgeDebit, 6), 6);
    await journal.finish(() => deps.saveCrossChainPosition({
      schemaVersion: 1, id: `cross-chain-liquidity-preview:${lp.tokenId}`, walletAddress: record.wallet as `0x${string}`,
      basketSlug: "cross-chain-liquidity-preview", basketVersion: plan.basketVersion,
      investedUsdc: plan.total, retainedUsdc: retained, morphoUsdc: plan.morpho, baseUsdc: received,
      morphoTransactionHash: earn.txHash, bridgeTransactionHashes: bridgeTransactionSteps(bridged).map((step) => step.txHash as `0x${string}`),
      swapTransactionHash: swapped.swapHash, mintTransactionHash: lp.mintHash, tokenId: lp.tokenId, liquidity: lp.liquidity,
      depositedUsdc: lp.amountUsdc, depositedWeth: lp.amountWeth,
      residualUsdc: formatUnits(parseUnits(remaining, 6) - parseUnits(lp.amountUsdc, 6), 6),
      residualWeth: formatUnits(parseUnits(swapped.amountOut, 18) - parseUnits(lp.amountWeth, 18), 18), status: "active", createdAt: Date.now(),
    }));
    return lp;
  });
}

export async function executeExitRoute(record: RouteRecord<ExitPlan>, wallet: Wallet, deps: RouteClients = clients) {
  return withRouteLock(record.wallet, async () => {
    assertRouteCurrent(record);
    const journal = routeJournal(record);
    const position = record.plan.position;
    await wallet.switchToBase();
    const provider = await checkedProvider(wallet, record.baseWallet);
    const removed = await journal.step("LP removal", () => deps.removeBaseWideRangePosition(provider, position.tokenId));
    const usdc = formatUnits(parseUnits(removed.usdcAmount, 6) + parseUnits(position.residualUsdc, 6), 6);
    const weth = formatUnits(parseUnits(removed.wethAmount, 18) + parseUnits(position.residualWeth, 18), 18);
    const swapped = parseUnits(weth, 18) === 0n ? null : await journal.preparedStep("Exit swap", () => deps.quoteBaseUniswapSwap(weth, "WETH"), (fresh) => deps.executeBaseUniswapSwap(provider, fresh));
    const total = formatUnits(parseUnits(usdc, 6) + parseUnits(swapped?.amountOut ?? "0", 6), 6);
    const bridged = await bridge(record, journal, provider, async () => {
      const initial = await deps.quoteCctpBridge(provider, "base-to-arc", record.wallet as `0x${string}`, total);
      return deps.quoteCctpBridge(provider, "base-to-arc", record.wallet as `0x${string}`, subtractReturnFee(total, initial.feeTotal));
    }, deps);
    await journal.finish(() => deps.saveCrossChainPosition({ ...position, status: "exited", exitedUsdc: bridged.amount,
      exitTransactionHashes: [...removed.hashes, ...(swapped ? [swapped.swapHash] : []), ...bridgeTransactionSteps(bridged).map((step) => step.txHash as `0x${string}`)],
    }));
  });
}

export function entryRouteStage(record: RouteRecord<EntryPlan>) {
  return Object.hasOwn(record.results, "LP mint") ? 4 : Object.hasOwn(record.results, "Base swap") ? 3 : Object.hasOwn(record.results, "received") ? 2 : Object.hasOwn(record.results, "Morpho deposit") ? 1 : 0;
}
