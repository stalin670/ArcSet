"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, Check, LoaderCircle, ShieldCheck, Wallet } from "lucide-react";
import type { EIP1193Provider } from "viem";
import { useArcWallet } from "@/components/arc-wallet-context";
import { FormattedNumber } from "@/components/formatted-number";
import { executeArcEarnQuote, quoteArcEarnDeposit, type ArcEarnDepositQuote } from "@/lib/arc-earn-client";
import { executeUsdcToToken, quoteUsdcToToken, RESERVE_CURRENCY_SLIPPAGE_BPS, type ArcSwapOutputToken, type ArcSwapQuote } from "@/lib/arc-swap-client";
import { ARC_EXPLORER_URL, ARC_TESTNET } from "@/lib/arc";
import { allocateBasketAmount, parseBasketUsdcAmount } from "@/lib/basket-amount";
import type { Basket, BasketLeg } from "@/lib/baskets";
import { positionsForWallet, readStoredPositions, recordBasketPosition, type AssetExecutionToken, type StoredAssetExecutionLeg } from "@/lib/positions";

type Phase = "entry" | "quoting" | "review" | "executing" | "success" | "partial";
type SwapStep = { kind: "swap"; leg: BasketLeg; quote: ArcSwapQuote };
type EarnStep = { kind: "earn"; leg: BasketLeg; quote: ArcEarnDepositQuote };
type QuotedStep = SwapStep | EarnStep;
type CompletedStep = {
  leg: BasketLeg;
  record: StoredAssetExecutionLeg;
  explorerUrl?: string;
};

function outputTokenForLeg(leg: BasketLeg): ArcSwapOutputToken {
  if (leg.symbol === "EURC" || leg.symbol === "cirBTC") return leg.symbol;
  throw new Error(`${leg.symbol} is not supported by the Arc swap adapter.`);
}

function recordTokenForLeg(leg: BasketLeg): AssetExecutionToken {
  return leg.execution === "app-kit-earn" ? "EARN-USDC" : outputTokenForLeg(leg);
}

function completedStepFor(step: QuotedStep, completed: CompletedStep[]) {
  const token = recordTokenForLeg(step.leg);
  return completed.find((item) => item.record.outputToken === token && item.record.status === "complete");
}

function swapTokenPrice(quote: ArcSwapQuote) {
  if (quote.outputToken === "EURC") return 1;
  const output = Number(quote.estimatedOutput);
  return output > 0 ? Number(quote.amountIn) / output : undefined;
}

function userFacingCompositeError(error: unknown, completed: number) {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if ("message" in current && typeof current.message === "string") messages.push(current.message);
    current = "cause" in current ? current.cause : null;
  }
  const message = messages.join(" ").toLowerCase();
  if (message.includes("batched call timeout") || message.includes("batch identifier") || message.includes("wallet_getcallsstatus")) {
    return "Circle submitted the transaction, but receipt tracking paused. Refresh Portfolio and verify the wallet balance before retrying.";
  }
  if (message.includes("expired")) return "A remaining quote expired. Inspect completed transactions before requesting a recovery plan.";
  if (message.includes("still pending")) return "The transaction was submitted but is still pending. ArcSet will reconcile it from the Portfolio page before another step can run.";
  if (message.includes("rpc endpoint") || message.includes("allowance") || message.includes("approval") || message.includes("permit")) {
    return completed
      ? "The wallet did not broadcast the USDC approval for the remaining swap. Your completed allocation is safe. Retry and approve the spending request."
      : "The wallet did not broadcast the USDC approval. Retry and approve the spending request; no swap transaction was sent.";
  }
  if (message.includes("stop limit") || message.includes("slippage")) return "Circle could not build the protected swap at the current Testnet price. Request a fresh plan or use a smaller amount.";
  if (message.includes("reject") || message.includes("denied") || message.includes("cancel")) {
    return completed ? "Signing stopped after part of the basket completed. Only retry the remaining steps shown below." : "Investment cancelled before any allocation completed.";
  }
  if (message.includes("insufficient")) return "Insufficient USDC for the basket allocations and Arc network fees.";
  if (message.includes("route") || message.includes("liquidity") || message.includes("not found")) return "One allocation has no executable Arc route for this amount. Try a different amount.";
  if (message.includes("vault") || message.includes("morpho")) return completed ? "The vault step could not complete after an earlier allocation finalized." : "The verified USDC vault is temporarily unavailable.";
  return completed ? "Execution stopped after part of the basket finalized. Inspect the completed steps before retrying." : "The basket could not be executed. No completed allocation was recorded.";
}

export function CompositeInvestmentPanel({ basket }: { basket: Basket }) {
  const wallet = useArcWallet();
  const [amount, setAmount] = useState("10");
  const [microUsdc, setMicroUsdc] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<Phase>("entry");
  const [steps, setSteps] = useState<QuotedStep[]>([]);
  const [completed, setCompleted] = useState<CompletedStep[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [dismissedRecoveryId, setDismissedRecoveryId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const executionLock = useRef(false);
  const executionId = useRef<string | null>(null);

  const allocations = useMemo(
    () => microUsdc == null ? [] : allocateBasketAmount(basket.legs, microUsdc),
    [basket, microUsdc],
  );
  const retainedUsdc = allocations.find(({ leg }) => leg.execution === "hold" && leg.symbol === "USDC")?.value ?? "0";

  const recovery = useMemo(() => {
    if (!wallet.address) return null;
    try {
      const latest = positionsForWallet(readStoredPositions(), wallet.address)
        .filter((position) => position.basketSlug === basket.slug && position.basketVersion === basket.version && position.status === "partial")
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;
      return latest?.id === dismissedRecoveryId ? null : latest;
    } catch {
      return null;
    }
  }, [basket.slug, basket.version, dismissedRecoveryId, wallet.address]);

  async function getProvider() {
    if (wallet.status !== "ready" || !wallet.getEthereumProvider) throw new Error("Sign in to your Arc wallet before requesting quotes.");
    return await wallet.getEthereumProvider() as EIP1193Provider;
  }

  async function recoverWallet() {
    if (wallet.status === "signed-out") wallet.login();
    else if (wallet.status === "wallet-missing") await wallet.createWallet();
    else if (wallet.status === "wrong-chain") await wallet.switchToArc();
  }

  function reset() {
    setPhase("entry");
    setMicroUsdc(null);
    setSteps([]);
    setCompleted([]);
    setActiveIndex(null);
    setError("");
    executionLock.current = false;
    executionId.current = null;
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function quoteExecutableSteps(parsed: bigint) {
    const provider = await getProvider();
    const executable = allocateBasketAmount(basket.legs, parsed).filter(({ leg }) => leg.execution !== "hold");
    return Promise.all(executable.map(async ({ leg, value }): Promise<QuotedStep> => {
      if (leg.execution === "app-kit-earn") return { kind: "earn", leg, quote: await quoteArcEarnDeposit(provider, value) };
      if (leg.execution === "app-kit-swap") return { kind: "swap", leg, quote: await quoteUsdcToToken(provider, outputTokenForLeg(leg), value) };
      throw new Error(`${leg.name} does not have an executable protocol adapter.`);
    }));
  }

  async function resumeRecovery() {
    if (!recovery) return;
    setError("");
    setPhase("quoting");
    try {
      const parsed = parseBasketUsdcAmount(recovery.investedUsdc);
      const quoted = await quoteExecutableSteps(parsed);
      const restored = recovery.legs
        .filter((record) => record.status === "complete")
        .map((record): CompletedStep | null => {
          const leg = basket.legs.find((candidate) => candidate.execution !== "hold" && recordTokenForLeg(candidate) === record.outputToken);
          return leg ? { leg, record, explorerUrl: `${ARC_EXPLORER_URL}/tx/${record.transactionHash}` } : null;
        })
        .filter((item): item is CompletedStep => item !== null);
      setAmount(recovery.investedUsdc);
      setMicroUsdc(parsed);
      setSteps(quoted);
      setCompleted(restored);
      executionId.current = recovery.id;
      setPhase("partial");
    } catch (recoveryError) {
      setError(userFacingCompositeError(recoveryError, recovery.legs.length));
      setPhase("entry");
    }
  }

  async function requestQuotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (wallet.status !== "ready") {
      await recoverWallet();
      return;
    }

    let parsed: bigint;
    try {
      parsed = parseBasketUsdcAmount(amount);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Enter a valid USDC amount.");
      inputRef.current?.focus();
      return;
    }
    if (wallet.balance != null && Number(amount) > wallet.balance) {
      setError("Your Arc wallet does not have enough USDC for this basket amount and gas.");
      inputRef.current?.focus();
      return;
    }

    setMicroUsdc(parsed);
    setPhase("quoting");
    try {
      const quoted = await quoteExecutableSteps(parsed);
      setSteps(quoted);
      setCompleted([]);
      setPhase("review");
    } catch (quoteError) {
      setError(userFacingCompositeError(quoteError, 0));
      setPhase("entry");
    }
  }

  function persistProgress(nextCompleted: CompletedStep[], complete: boolean) {
    if (!wallet.address || !executionId.current) return;
    const hasPending = nextCompleted.some((item) => item.record.status === "pending");
    recordBasketPosition({
      schemaVersion: 2,
      id: executionId.current,
      walletAddress: wallet.address,
      basketSlug: basket.slug,
      basketVersion: basket.version,
      chainId: ARC_TESTNET.id,
      investedUsdc: amount,
      retainedUsdc,
      status: hasPending ? "pending" : complete ? "complete" : "partial",
      legs: nextCompleted.map((item) => item.record),
      createdAt: Date.now(),
    });
  }

  async function executeBasket() {
    if (!steps.length || executionLock.current) return;
    if (!steps.some((step) => !completedStepFor(step, completed))) return;

    executionLock.current = true;
    executionId.current = executionId.current ?? `${basket.slug}:${Date.now()}`;
    setError("");
    setPhase("executing");
    const confirmed = [...completed];
    try {
      const provider = await getProvider();
      for (let index = 0; index < steps.length; index += 1) {
        if (completedStepFor(steps[index], confirmed)) continue;
        setActiveIndex(index);
        const previousStep = steps[index];
        // Refresh immediately before every signature. Later steps can no longer
        // expire while the user approves an earlier allocation.
        const step: QuotedStep = previousStep.kind === "earn"
          ? { ...previousStep, quote: await quoteArcEarnDeposit(provider, previousStep.quote.amountIn) }
          : { ...previousStep, quote: await quoteUsdcToToken(provider, outputTokenForLeg(previousStep.leg), previousStep.quote.amountIn) };
        setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? step : item));
        let completedStep: CompletedStep;
        if (step.kind === "swap") {
          const execution = await executeUsdcToToken(provider, step.quote);
          if (execution.outputToken === "USDC") throw new Error("The basket swap returned an unexpected USDC output.");
          completedStep = {
            leg: step.leg,
            explorerUrl: execution.explorerUrl,
            record: {
              name: step.leg.name,
              outputToken: execution.outputToken,
              amountInUsdc: execution.amountIn,
              outputAmount: execution.amountOut ?? step.quote.estimatedOutput,
              outputAmountSource: execution.amountOut ? "actual" : "estimated",
              transactionHash: execution.txHash as `0x${string}`,
              status: execution.status === "DONE" ? "complete" : "pending",
            },
          };
        } else {
          const execution = await executeArcEarnQuote(provider, step.quote);
          completedStep = {
            leg: step.leg,
            explorerUrl: execution.explorerUrl,
            record: {
              name: step.leg.name,
              outputToken: "EARN-USDC",
              amountInUsdc: step.quote.amountIn,
              outputAmount: execution.amount,
              outputAmountSource: "actual",
              transactionHash: execution.txHash,
              status: "complete",
            },
          };
        }
        confirmed.push(completedStep);
        setCompleted([...confirmed]);
        persistProgress(confirmed, steps.every((currentStep) => Boolean(completedStepFor(currentStep, confirmed))));
        if (completedStep.record.status === "pending") throw new Error("The submitted Arc transaction is still pending.");
      }
      setActiveIndex(null);
      setPhase("success");
      if (recovery) setDismissedRecoveryId(recovery.id);
      await wallet.refreshBalance();
    } catch (executeError) {
      setActiveIndex(null);
      setCompleted([...confirmed]);
      persistProgress(confirmed, false);
      setError(userFacingCompositeError(executeError, confirmed.length));
      setPhase(confirmed.length ? "partial" : "review");
    } finally {
      executionLock.current = false;
    }
  }

  const walletLabel = wallet.status === "wrong-chain" ? "Switch to Arc" : wallet.status === "wallet-missing" ? "Create Arc wallet" : wallet.status === "loading" ? "Loading wallet…" : wallet.status === "unconfigured" ? "Wallet unavailable" : "Sign in to invest";

  if (phase === "success" || phase === "partial") {
    const remainingCount = steps.filter((step) => !completedStepFor(step, completed)).length;
    const hasPending = completed.some((item) => item.record.status === "pending");
    return (
      <PanelShell title={phase === "success" ? "Investment complete" : "Partially completed"} eyebrow={phase === "success" ? "CONFIRMED" : "RECOVERY"}>
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-full ${phase === "success" ? "bg-accent text-accent-foreground" : "bg-warning/15 text-warning"}`}>{phase === "success" ? <Check aria-hidden="true" size={19} /> : <AlertCircle aria-hidden="true" size={19} />}</span>
          <p className="text-sm leading-6 text-muted-foreground">{phase === "success" ? "Every allocation finalized on Arc and remains under your wallet's control." : hasPending ? "A transaction was submitted and is awaiting receipt reconciliation. Continue from Portfolio after it confirms." : `${completed.length} of ${steps.length} allocations completed. Retry only the ${remainingCount} remaining ${remainingCount === 1 ? "step" : "steps"}.`}</p>
        </div>
        <div className="mt-5 space-y-2">
          {completed.map(({ leg, record, explorerUrl }) => <article key={record.transactionHash} className="rounded-xl bg-muted p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">{leg.name}</p><p className={`mt-1 text-xs font-bold ${record.status === "complete" ? "text-primary" : "text-warning"}`}>{record.status === "complete" ? "Confirmed" : "Submitted · checking receipt"}</p></div>{explorerUrl ? <a href={explorerUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-bold">ArcScan <ArrowUpRight aria-hidden="true" size={14} /></a> : null}</div></article>)}
        </div>
        {error ? <p className="mt-4 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : null}
        <div className="mt-5 grid gap-2">
          {phase === "partial" && remainingCount > 0 && !hasPending ? <button type="button" onClick={() => void executeBasket()} className="focus-ring min-h-11 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">Retry remaining steps</button> : null}
          <Link href="/positions" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold text-secondary-foreground">View portfolio</Link>
          {phase === "success" ? <button type="button" onClick={reset} className="focus-ring min-h-11 rounded-[var(--radius-control)] px-4 text-sm font-bold text-muted-foreground">Invest again</button> : null}
        </div>
      </PanelShell>
    );
  }

  if ((phase === "review" || phase === "executing") && steps.length && microUsdc != null) {
    return (
      <PanelShell title={phase === "executing" ? "Executing investment" : "Review investment"} eyebrow={`v${basket.version}`}>
        <dl className="divide-y divide-border rounded-xl bg-muted px-4">
          <AmountRow label="You invest" value={amount} token="USDC" tokenPriceUsd={1} />
          <AmountRow label="Stays liquid" value={retainedUsdc} token="USDC" tokenPriceUsd={1} />
        </dl>
        <div className="mt-4 space-y-3">
          {steps.map((step, index) => <StepReview key={`${step.leg.symbol}-${index}`} step={step} status={completedStepFor(step, completed) ? "Confirmed" : activeIndex === index ? "Submitting" : phase === "executing" ? "Queued" : null} />)}
        </div>
        <div className="mt-4 flex gap-2 rounded-xl bg-concept/10 p-3 text-xs leading-5 text-concept"><ShieldCheck className="mt-0.5 shrink-0" aria-hidden="true" size={16} /><p>After confirming the plan, approve each sponsored passkey operation. ArcSet submits verified legs in order and shows every receipt here.</p></div>
        {error ? <p className="mt-3 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : null}
        {phase === "review" ? <><button type="button" onClick={() => void executeBasket()} className="focus-ring mt-5 min-h-12 w-full rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">Confirm investment</button><button type="button" onClick={reset} className="focus-ring mt-2 min-h-11 w-full rounded-[var(--radius-control)] px-4 text-sm font-bold text-muted-foreground">Cancel</button></> : <div className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-secondary text-sm font-bold"><LoaderCircle className="animate-spin" aria-hidden="true" size={17} /> Submitting reviewed steps</div>}
      </PanelShell>
    );
  }

  return (
    <form onSubmit={requestQuotes} noValidate className="rounded-[var(--radius-card)] border border-border bg-card p-5 md:p-6">
      <h2 className="text-lg font-extrabold tracking-[-0.02em]">Buy basket</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">One allocation plan, with a separate protected step for each protocol.</p>
      {recovery ? <div className="mt-4 rounded-xl border border-warning/20 bg-warning/5 p-4"><p className="text-sm font-extrabold">Incomplete investment found</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Completed transactions will not run again. Quote and resume only the missing allocation.</p><button type="button" onClick={() => void resumeRecovery()} disabled={phase === "quoting"} className="focus-ring mt-3 min-h-10 rounded-[var(--radius-control)] bg-secondary px-3 text-sm font-bold disabled:opacity-60">Resume remaining allocation</button></div> : null}
      <div className="mt-5">
        <label htmlFor={`composite-amount-${basket.slug}`} className="text-sm font-bold">You invest</label>
        <div className="mt-2 flex min-h-14 items-center rounded-[var(--radius-control)] border border-input bg-background px-4 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"><input ref={inputRef} id={`composite-amount-${basket.slug}`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={error ? "true" : undefined} aria-describedby={error ? `composite-error-${basket.slug}` : `composite-hint-${basket.slug}`} className="min-w-0 flex-1 bg-transparent font-mono text-xl font-bold tabular-nums outline-none" /><span className="text-sm font-bold text-muted-foreground">USDC</span></div>
        {error ? <p id={`composite-error-${basket.slug}`} className="mt-2 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : <p id={`composite-hint-${basket.slug}`} className="mt-2 text-xs leading-5 text-muted-foreground">Quotes verify swaps, the live Morpho vault, fees, and minimum outputs.</p>}
      </div>
      {wallet.status !== "ready" ? <button type="button" onClick={() => void recoverWallet()} disabled={wallet.status === "loading" || wallet.status === "unconfigured" || wallet.actionPending} aria-busy={wallet.actionPending || wallet.status === "loading"} className="focus-ring mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-60"><Wallet aria-hidden="true" size={17} /> {walletLabel}</button> : <button type="submit" disabled={phase === "quoting"} aria-busy={phase === "quoting"} className="focus-ring mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-70">{phase === "quoting" ? <><LoaderCircle className="animate-spin" aria-hidden="true" size={17} /> Verifying routes…</> : "Review live plan"}</button>}
    </form>
  );
}

function StepReview({ step, status }: { step: QuotedStep; status: string | null }) {
  if (step.kind === "swap") {
    const tokenPrice = swapTokenPrice(step.quote);
    return <article className="rounded-xl bg-muted p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-extrabold">{step.leg.name}</p><p className="mt-1 text-xs text-muted-foreground">Circle App Kit swap</p></div><span className={`text-xs font-bold ${status === "Confirmed" ? "text-primary" : status === "Submitting" ? "text-warning" : "text-muted-foreground"}`}>{status ?? step.quote.outputToken}</span></div><dl className="mt-3 divide-y divide-border"><AmountRow label="Spend" value={step.quote.amountIn} token="USDC" tokenPriceUsd={1} compact /><AmountRow label="Expected" value={step.quote.estimatedOutput} token={step.quote.outputToken} tokenPriceUsd={tokenPrice} compact /><AmountRow label={`Minimum · ${RESERVE_CURRENCY_SLIPPAGE_BPS / 100}%`} value={step.quote.minimumOutput} token={step.quote.outputToken} tokenPriceUsd={tokenPrice} compact />{step.quote.fees.filter((fee) => fee.amount).map((fee, index) => <AmountRow key={`${fee.type}-${index}`} label={fee.type || "Provider fee"} value={fee.amount} token={fee.token} tokenPriceUsd={fee.token.toUpperCase() === "USDC" ? 1 : undefined} compact />)}</dl></article>;
  }
  return <article className="rounded-xl bg-muted p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-extrabold">{step.leg.name}</p><p className="mt-1 text-xs text-muted-foreground">{step.quote.vault.protocol} · verified ERC-4626 vault</p></div><span className={`text-xs font-bold ${status === "Confirmed" ? "text-primary" : status === "Submitting" ? "text-warning" : "text-muted-foreground"}`}>{status ?? "EARN"}</span></div><dl className="mt-3 divide-y divide-border"><AmountRow label="Deposit" value={step.quote.amountIn} token="USDC" tokenPriceUsd={1} compact /><AmountRow label="Expected shares" value={step.quote.expectedShares} token="shares" tokenPriceUsd={Number(step.quote.sharePrice)} compact /><PercentRow label="Current variable APY" value={step.quote.vault.currentApy * 100} />{step.quote.gasFees.map((fee, index) => <AmountRow key={`${fee.name}-${index}`} label={fee.name || "Arc network fee"} value={fee.amountUsdc} token="USDC" tokenPriceUsd={1} compact />)}</dl></article>;
}

function PanelShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return <section className="rounded-[var(--radius-card)] border border-border bg-card p-5 md:p-6" aria-live="polite"><div className="flex items-baseline justify-between gap-4"><h2 className="text-lg font-extrabold tracking-[-0.02em]">{title}</h2><span className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.09em] text-primary">{eyebrow}</span></div><div className="mt-5">{children}</div></section>;
}

function AmountRow({ label, value, token, tokenPriceUsd, compact = false }: { label: string; value: string | null; token: string; tokenPriceUsd?: number; compact?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-4 ${compact ? "py-2" : "py-3"}`}><dt className={`${compact ? "text-xs" : "text-sm"} font-semibold text-muted-foreground`}>{label}</dt><dd className="text-right"><FormattedNumber value={value == null ? null : Number(value)} type="token_amount" context="detailed" tokenPriceUsd={tokenPriceUsd} className="font-bold" /><span className="ml-1.5 text-xs text-muted-foreground">{token}</span></dd></div>;
}

function PercentRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-baseline justify-between gap-4 py-2"><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd><FormattedNumber value={value} type="percent" context="detailed" className="font-bold" /></dd></div>;
}
