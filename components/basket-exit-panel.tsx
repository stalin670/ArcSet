"use client";

import { useRef, useState } from "react";
import { AlertCircle, ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import type { EIP1193Provider } from "viem";
import { useArcWallet } from "@/components/arc-wallet-context";
import { FormattedNumber } from "@/components/formatted-number";
import { executeArcEarnQuote, quoteArcEarnWithdrawal, type ArcEarnWithdrawalQuote } from "@/lib/arc-earn-client";
import { executeTokenSwap, quoteTokenSwap, type ArcSwapOutputToken, type ArcSwapQuote } from "@/lib/arc-swap-client";
import { ARC_TESTNET } from "@/lib/arc";
import type { Basket } from "@/lib/baskets";
import { recordBasketPosition, type AggregatedBasketPosition, type StoredAssetExecutionLeg } from "@/lib/positions";

type ExitPercent = 25 | 50 | 100;
type ExitStep =
  | { kind: "swap"; token: ArcSwapOutputToken; assetAmount: string; quote: ArcSwapQuote }
  | { kind: "earn"; token: "EARN-USDC"; assetAmount: string; quote: ArcEarnWithdrawalQuote };
type CompletedExit = { step: ExitStep; record: StoredAssetExecutionLeg; explorerUrl?: string };
type Phase = "closed" | "entry" | "quoting" | "review" | "executing" | "success" | "partial";

function scaledAmount(value: string, percent: ExitPercent) {
  const result = Number(value) * percent / 100;
  if (!Number.isFinite(result) || result <= 0) throw new Error("This basket has no recorded amount to exit.");
  return result.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 12 });
}

function exitError(error: unknown, completed: number) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("still pending")) return "The exit was submitted and will be reconciled from the Portfolio page before another step runs.";
  if (message.includes("reject") || message.includes("cancel") || message.includes("denied")) return completed ? "Signing stopped after part of the exit finalized. Retry only the remaining steps." : "Exit cancelled before any asset moved.";
  if (message.includes("insufficient")) return "The wallet no longer holds enough of a recorded basket asset. Review current balances.";
  if (message.includes("liquidity") || message.includes("route")) return "A current exit route is unavailable for one of the recorded assets.";
  return completed ? "The exit stopped after part of the basket finalized. Inspect the completed receipts." : "Couldn’t prepare or execute the basket exit.";
}

export function BasketExitPanel({ basket, position, earnValueMultiplier }: { basket: Basket; position: AggregatedBasketPosition; earnValueMultiplier: number }) {
  const wallet = useArcWallet();
  const [phase, setPhase] = useState<Phase>("closed");
  const [percent, setPercent] = useState<ExitPercent>(100);
  const [steps, setSteps] = useState<ExitStep[]>([]);
  const [completed, setCompleted] = useState<CompletedExit[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const executionId = useRef("");

  async function provider() {
    if (wallet.status !== "ready" || !wallet.getEthereumProvider) throw new Error("The Arc wallet is unavailable.");
    return await wallet.getEthereumProvider() as EIP1193Provider;
  }

  function reset() {
    setPhase("closed");
    setSteps([]);
    setCompleted([]);
    setActive(null);
    setError("");
    lock.current = false;
    executionId.current = "";
  }

  async function quoteExit() {
    setError("");
    setPhase("quoting");
    try {
      const walletProvider = await provider();
      const next = await Promise.all(position.outputs.map(async (output): Promise<ExitStep> => {
        if (output.token === "EARN-USDC") {
          const assetAmount = scaledAmount(output.amount, percent);
          const withdrawalAmount = (Number(assetAmount) * earnValueMultiplier).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 6 });
          return { kind: "earn", token: "EARN-USDC", assetAmount, quote: await quoteArcEarnWithdrawal(walletProvider, withdrawalAmount) };
        }
        const assetAmount = scaledAmount(output.amount, percent);
        return { kind: "swap", token: output.token, assetAmount, quote: await quoteTokenSwap(walletProvider, output.token, "USDC", assetAmount) };
      }));
      if (!next.length) throw new Error("This basket has no active protocol positions to exit.");
      setSteps(next);
      setCompleted([]);
      setPhase("review");
    } catch (cause) {
      setError(exitError(cause, 0));
      setPhase("entry");
    }
  }

  function persist(nextCompleted: CompletedExit[], complete: boolean) {
    if (!wallet.address || !executionId.current) return;
    const retainedReduction = Number(position.retainedUsdc) * percent / 100;
    recordBasketPosition({
      schemaVersion: 2,
      id: executionId.current,
      walletAddress: wallet.address,
      basketSlug: basket.slug,
      basketVersion: basket.version,
      chainId: ARC_TESTNET.id,
      investedUsdc: "0",
      retainedUsdc: retainedReduction > 0 ? `-${retainedReduction.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 6 })}` : "0",
      status: nextCompleted.some((item) => item.record.status === "pending") ? "pending" : complete ? "complete" : "partial",
      legs: nextCompleted.map((item) => item.record),
      createdAt: Date.now(),
    });
  }

  async function executeExit(startIndex = completed.length) {
    if (lock.current || !steps.length) return;
    lock.current = true;
    executionId.current ||= `${basket.slug}:exit:${Date.now()}`;
    setPhase("executing");
    setError("");
    const confirmed = [...completed];
    try {
      const walletProvider = await provider();
      for (let index = startIndex; index < steps.length; index += 1) {
        setActive(index);
        const previousStep = steps[index];
        const step: ExitStep = previousStep.kind === "earn"
          ? { ...previousStep, quote: await quoteArcEarnWithdrawal(walletProvider, previousStep.quote.amountOut) }
          : { ...previousStep, quote: await quoteTokenSwap(walletProvider, previousStep.token, "USDC", previousStep.assetAmount) };
        setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? step : item));
        let next: CompletedExit;
        if (step.kind === "swap") {
          const result = await executeTokenSwap(walletProvider, step.quote);
          next = { step, explorerUrl: result.explorerUrl, record: { name: `${step.token} exit`, operation: "sell", outputToken: step.token, amountInUsdc: result.amountOut ?? step.quote.estimatedOutput, outputAmount: step.assetAmount, outputAmountSource: "actual", transactionHash: result.txHash as `0x${string}`, status: result.status === "DONE" ? "complete" : "pending" } };
        } else {
          const result = await executeArcEarnQuote(walletProvider, step.quote);
          next = { step, explorerUrl: result.explorerUrl, record: { name: "Morpho vault exit", operation: "sell", outputToken: "EARN-USDC", amountInUsdc: result.amount, outputAmount: step.assetAmount, outputAmountSource: "actual", transactionHash: result.txHash, status: "complete" } };
        }
        confirmed.push(next);
        setCompleted([...confirmed]);
        persist(confirmed, index === steps.length - 1);
        if (next.record.status === "pending") throw new Error("The submitted Arc transaction is still pending.");
      }
      setActive(null);
      setPhase("success");
      await wallet.refreshBalance();
    } catch (cause) {
      setActive(null);
      setCompleted([...confirmed]);
      if (confirmed.length) persist(confirmed, false);
      setError(exitError(cause, confirmed.length));
      setPhase(confirmed.length ? "partial" : "review");
    } finally {
      lock.current = false;
    }
  }

  if (phase === "closed") return <button type="button" onClick={() => setPhase("entry")} className="focus-ring inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold text-secondary-foreground">Reduce or exit</button>;

  if (phase === "entry") return <div className="mt-4 rounded-xl border border-border bg-card p-4"><fieldset><legend className="text-sm font-extrabold">How much should leave this basket?</legend><div className="mt-3 grid grid-cols-3 gap-2">{([25, 50, 100] as const).map((value) => <button key={value} type="button" aria-pressed={percent === value} onClick={() => setPercent(value)} className={`focus-ring min-h-10 rounded-[var(--radius-control)] text-sm font-bold ${percent === value ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}><FormattedNumber value={value} type="percent" context="compact" /></button>)}</div></fieldset><p className="mt-3 text-xs leading-5 text-muted-foreground">The plan withdraws the recorded vault value and swaps recorded EURC or cirBTC back to USDC. Your liquid USDC does not require a transaction.</p>{error ? <p className="mt-3 text-xs font-semibold text-destructive" role="alert">{error}</p> : null}<div className="mt-4 flex gap-2"><button type="button" onClick={() => void quoteExit()} className="focus-ring min-h-10 rounded-[var(--radius-control)] bg-primary px-3 text-sm font-extrabold text-primary-foreground">Review exit</button><button type="button" onClick={reset} className="focus-ring min-h-10 rounded-[var(--radius-control)] px-3 text-sm font-bold text-muted-foreground">Cancel</button></div></div>;

  if (phase === "quoting") return <div className="mt-4 flex min-h-20 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-bold"><LoaderCircle className="animate-spin" aria-hidden="true" size={17} /> Quoting exit routes…</div>;

  if (phase === "success" || phase === "partial") return <div className="mt-4 rounded-xl border border-border bg-card p-4"><div className="flex gap-3">{phase === "success" ? <Check className="text-primary" aria-hidden="true" size={20} /> : <AlertCircle className="text-warning" aria-hidden="true" size={20} />}<div><h4 className="text-sm font-extrabold">{phase === "success" ? "Basket exit complete" : "Exit partially completed"}</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">{completed.some((item) => item.record.status === "pending") ? "A submitted exit is awaiting receipt reconciliation in Portfolio." : `${completed.length} of ${steps.length} protocol steps finalized.`}</p></div></div>{error ? <p className="mt-3 text-xs font-semibold text-destructive" role="alert">{error}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{phase === "partial" && completed.length < steps.length && !completed.some((item) => item.record.status === "pending") ? <button type="button" onClick={() => void executeExit(completed.length)} className="focus-ring min-h-10 rounded-[var(--radius-control)] bg-primary px-3 text-sm font-extrabold text-primary-foreground">Retry remaining</button> : null}<button type="button" onClick={reset} className="focus-ring min-h-10 rounded-[var(--radius-control)] bg-secondary px-3 text-sm font-bold">Done</button></div></div>;

  return <div className="mt-4 rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between gap-3"><h4 className="text-sm font-extrabold">{phase === "executing" ? "Executing exit" : "Review basket exit"}</h4><span className="font-mono text-xs font-bold text-primary"><FormattedNumber value={percent} type="percent" context="compact" /></span></div><div className="mt-4 space-y-2">{steps.map((step, index) => <div key={`${step.token}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3"><div><p className="text-xs font-bold">{step.token === "EARN-USDC" ? "Withdraw Morpho vault" : `Swap ${step.token} to USDC`}</p><p className="mt-1 text-xs text-muted-foreground"><FormattedNumber value={Number(step.assetAmount)} type="token_amount" context="detailed" tokenPriceUsd={step.token === "cirBTC" ? undefined : 1} /> {step.token}</p></div>{completed[index] ? <a href={completed[index].explorerUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-10 items-center gap-1 px-2 text-xs font-bold text-primary">Receipt <ArrowUpRight aria-hidden="true" size={13} /></a> : <span className={`text-xs font-bold ${active === index ? "text-warning" : "text-muted-foreground"}`}>{active === index ? "Submitting" : phase === "executing" ? "Queued" : "Ready"}</span>}</div>)}</div>{error ? <p className="mt-3 text-xs font-semibold text-destructive" role="alert">{error}</p> : null}{phase === "review" ? <><p className="mt-3 text-xs leading-5 text-muted-foreground">Approve each sponsored passkey operation as the reviewed exit proceeds. Progress and receipts appear here.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => void executeExit(0)} className="focus-ring min-h-10 rounded-[var(--radius-control)] bg-primary px-3 text-sm font-extrabold text-primary-foreground">Confirm exit</button><button type="button" onClick={reset} className="focus-ring min-h-10 rounded-[var(--radius-control)] px-3 text-sm font-bold text-muted-foreground">Cancel</button></div></> : <div className="mt-4 flex min-h-10 items-center gap-2 text-xs font-bold text-muted-foreground"><LoaderCircle className="animate-spin" aria-hidden="true" size={15} /> Submitting reviewed exit steps</div>}</div>;
}
