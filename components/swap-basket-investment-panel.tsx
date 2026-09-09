"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, Check, LoaderCircle, ShieldCheck, Wallet } from "lucide-react";
import type { EIP1193Provider } from "viem";
import { useArcWallet } from "@/components/arc-wallet-context";
import { FormattedNumber } from "@/components/formatted-number";
import {
  executeUsdcToToken,
  quoteUsdcToToken,
  RESERVE_CURRENCY_SLIPPAGE_BPS,
  type ArcSwapExecution,
  type ArcSwapOutputToken,
  type ArcSwapQuote,
} from "@/lib/arc-swap-client";
import { allocateBasketAmount, parseBasketUsdcAmount } from "@/lib/basket-amount";
import { ARC_TESTNET } from "@/lib/arc";
import type { Basket, BasketLeg } from "@/lib/baskets";
import { recordBasketPosition } from "@/lib/positions";

const QUOTE_TTL_MS = 30_000;
type Phase = "entry" | "quoting" | "review" | "executing" | "success" | "partial";
type QuotedLeg = { leg: BasketLeg; quote: ArcSwapQuote };
type CompletedLeg = { leg: BasketLeg; execution: ArcSwapExecution & { outputToken: ArcSwapOutputToken } };

function outputTokenForLeg(leg: BasketLeg): ArcSwapOutputToken {
  if (leg.symbol === "EURC" || leg.symbol === "cirBTC") return leg.symbol;
  throw new Error(`${leg.symbol} is not supported by the Arc swap basket executor.`);
}

function outputTokenPrice(quote: ArcSwapQuote) {
  if (quote.outputToken === "EURC") return 1;
  const output = Number(quote.estimatedOutput);
  return output > 0 ? Number(quote.amountIn) / output : undefined;
}

function userFacingError(error: unknown, action: "quote" | "execute", completed = 0) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("reject") || message.includes("denied") || message.includes("cancel")) {
    return completed ? "Wallet signing stopped after some swaps completed. Do not repeat the full basket." : "Investment cancelled before any swap completed.";
  }
  if (message.includes("insufficient")) return "Insufficient USDC for the basket and Arc network fees.";
  if (message.includes("route") || message.includes("liquidity") || message.includes("not found")) {
    return "No executable Arc route is available for one of these allocations. Try a different basket amount.";
  }
  return action === "quote"
    ? "Couldn’t quote every basket leg on Arc. Try again in a moment."
    : completed
      ? "Execution stopped after some swaps completed. Inspect the confirmed transactions before taking another action."
      : "No basket swap was confirmed. Check your wallet and try again.";
}

export function SwapBasketInvestmentPanel({ basket }: { basket: Basket }) {
  const wallet = useArcWallet();
  const [amount, setAmount] = useState("10");
  const [microUsdc, setMicroUsdc] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<Phase>("entry");
  const [quotes, setQuotes] = useState<QuotedLeg[]>([]);
  const [completed, setCompleted] = useState<CompletedLeg[]>([]);
  const [activeToken, setActiveToken] = useState<ArcSwapOutputToken | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const executionLock = useRef(false);
  const executionId = useRef<string | null>(null);
  const allocations = useMemo(
    () => microUsdc == null ? [] : allocateBasketAmount(basket.legs, microUsdc),
    [basket, microUsdc],
  );
  const retainedUsdc = allocations.find(({ leg }) => leg.execution === "hold" && leg.symbol === "USDC")?.value ?? "0";

  async function getProvider() {
    if (wallet.status !== "ready" || !wallet.getEthereumProvider) throw new Error("Sign in to your Arc wallet before requesting a quote.");
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
    setQuotes([]);
    setCompleted([]);
    setActiveToken(null);
    setError("");
    executionLock.current = false;
    executionId.current = null;
    requestAnimationFrame(() => inputRef.current?.focus());
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
      setError("Your Arc wallet does not have enough USDC for this basket amount.");
      inputRef.current?.focus();
      return;
    }

    setMicroUsdc(parsed);
    setPhase("quoting");
    try {
      const provider = await getProvider();
      const nextAllocations = allocateBasketAmount(basket.legs, parsed).filter(({ leg }) => leg.execution === "app-kit-swap");
      if (!nextAllocations.length) throw new Error("This basket has no executable swap legs.");
      const nextQuotes = await Promise.all(nextAllocations.map(async ({ leg, value }) => ({
        leg,
        quote: await quoteUsdcToToken(provider, outputTokenForLeg(leg), value),
      })));
      setQuotes(nextQuotes);
      setCompleted([]);
      setPhase("review");
    } catch (quoteError) {
      setError(userFacingError(quoteError, "quote"));
      setPhase("entry");
    }
  }

  async function executeBasket() {
    if (!quotes.length || executionLock.current) return;
    if (quotes.some(({ quote }) => Date.now() - quote.quotedAt > QUOTE_TTL_MS)) {
      setError("The basket quotes expired. Request fresh quotes before signing.");
      setPhase("entry");
      setQuotes([]);
      return;
    }

    executionLock.current = true;
    executionId.current = executionId.current ?? `${basket.slug}:${Date.now()}`;
    setError("");
    setCompleted([]);
    setPhase("executing");
    const confirmed: CompletedLeg[] = [];
    try {
      const provider = await getProvider();
      for (const [index, quotedLeg] of quotes.entries()) {
        const outputToken = outputTokenForLeg(quotedLeg.leg);
        setActiveToken(outputToken);
        const execution = await executeUsdcToToken(provider, quotedLeg.quote);
        if (execution.outputToken === "USDC") throw new Error("The basket swap returned an unexpected USDC output.");
        confirmed.push({ leg: quotedLeg.leg, execution: { ...execution, outputToken } });
        setCompleted([...confirmed]);
        if (wallet.address && executionId.current) {
          const allComplete = index === quotes.length - 1;
          const hasPendingLeg = confirmed.some((item) => item.execution.status !== "DONE");
          recordBasketPosition({
            schemaVersion: 2,
            id: executionId.current,
            walletAddress: wallet.address,
            basketSlug: basket.slug,
            basketVersion: basket.version,
            chainId: ARC_TESTNET.id,
            investedUsdc: amount,
            retainedUsdc,
            status: hasPendingLeg ? "pending" : allComplete ? "complete" : "partial",
            legs: confirmed.map(({ leg, execution: completedExecution }) => ({
              name: leg.name,
              outputToken: completedExecution.outputToken,
              amountInUsdc: completedExecution.amountIn,
              outputAmount: completedExecution.amountOut ?? quotes.find((item) => item.leg === leg)?.quote.estimatedOutput ?? null,
              outputAmountSource: completedExecution.amountOut ? "actual" : "estimated",
              transactionHash: completedExecution.txHash as `0x${string}`,
              status: completedExecution.status === "DONE" ? "complete" : "pending",
            })),
            createdAt: Date.now(),
          });
        }
      }
      setActiveToken(null);
      setPhase("success");
      await wallet.refreshBalance();
    } catch (executeError) {
      setActiveToken(null);
      setError(userFacingError(executeError, "execute", confirmed.length));
      setPhase(confirmed.length ? "partial" : "review");
    } finally {
      executionLock.current = false;
    }
  }

  const walletLabel = wallet.status === "wrong-chain"
    ? "Switch to Arc"
    : wallet.status === "wallet-missing"
      ? "Create Arc wallet"
      : wallet.status === "loading"
        ? "Loading wallet…"
        : wallet.status === "unconfigured"
          ? "Wallet unavailable"
          : "Sign in to invest";

  if (phase === "success" || phase === "partial") {
    return (
      <PanelShell title={phase === "success" ? "Investment complete" : "Partially completed"} eyebrow={phase === "success" ? "CONFIRMED" : "ACTION REQUIRED"}>
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-full ${phase === "success" ? "bg-accent text-accent-foreground" : "bg-warning/15 text-warning"}`}>{phase === "success" ? <Check aria-hidden="true" size={19} /> : <AlertCircle aria-hidden="true" size={19} />}</span>
          <p className="text-sm leading-6 text-muted-foreground">{phase === "success" ? "Every swap finalized on Arc. The output assets are held directly by your wallet." : "Some swaps finalized before execution stopped. Do not repeat the full basket until you inspect these transactions."}</p>
        </div>
        <div className="mt-5 space-y-2">
          {completed.map(({ leg, execution }) => (
            <article key={execution.txHash} className="rounded-xl bg-muted p-4">
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">{leg.name}</p><p className="mt-1 text-xs text-muted-foreground">Received <FormattedNumber value={Number(execution.amountOut ?? 0)} type="token_amount" context="detailed" tokenPriceUsd={execution.outputToken === "EURC" ? 1 : execution.amountOut && Number(execution.amountOut) > 0 ? Number(execution.amountIn) / Number(execution.amountOut) : undefined} /> {execution.outputToken}</p></div>{execution.explorerUrl ? <a href={execution.explorerUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-bold">ArcScan <ArrowUpRight aria-hidden="true" size={14} /></a> : null}</div>
            </article>
          ))}
        </div>
        {error ? <p className="mt-4 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : null}
        <div className="mt-5 grid gap-2">
          {phase === "success" ? <button type="button" onClick={reset} className="focus-ring pressable min-h-11 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">Invest again</button> : null}
          <Link href="/explore" className="focus-ring pressable inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold text-secondary-foreground">Explore baskets</Link>
        </div>
      </PanelShell>
    );
  }

  if ((phase === "review" || phase === "executing") && quotes.length && microUsdc != null) {
    return (
      <PanelShell title={phase === "executing" ? "Executing investment" : "Review investment"} eyebrow={`v${basket.version}`}>
        <dl className="divide-y divide-border rounded-xl bg-muted px-4">
          <AmountRow label="You invest" value={amount} token="USDC" tokenPriceUsd={1} />
          <AmountRow label="Stays in wallet" value={retainedUsdc} token="USDC" tokenPriceUsd={1} />
        </dl>
        <div className="mt-4 space-y-3">
          {quotes.map(({ leg, quote }) => (
            <article key={leg.symbol} className="rounded-xl bg-muted p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-extrabold">{leg.name}</p><p className="mt-1 text-xs text-muted-foreground">Swap {quote.amountIn} USDC</p></div><span className="rounded-full bg-surface-strong px-2.5 py-1 text-xs font-bold">{quote.outputToken}</span></div>
              <dl className="mt-3 divide-y divide-border">
                <AmountRow label="Expected" value={quote.estimatedOutput} token={quote.outputToken} tokenPriceUsd={outputTokenPrice(quote)} compact />
                <AmountRow label="Minimum" value={quote.minimumOutput} token={quote.outputToken} tokenPriceUsd={outputTokenPrice(quote)} compact />
                {quote.fees.map((fee, index) => <AmountRow key={`${fee.type}-${index}`} label={`${fee.type} fee`} value={fee.amount} token={fee.token} tokenPriceUsd={1} compact />)}
              </dl>
            </article>
          ))}
        </div>
        <div className="mt-4 flex gap-2 rounded-xl bg-concept/10 p-3 text-xs leading-5 text-concept"><ShieldCheck className="mt-0.5 shrink-0" aria-hidden="true" size={16} /><p>Each minimum output uses {RESERVE_CURRENCY_SLIPPAGE_BPS / 100}% slippage protection. Approve each sponsored passkey operation as the reviewed swaps execute with progress shown here.</p></div>
        {phase === "executing" ? <div className="mt-4 space-y-2" aria-live="polite">{quotes.map(({ quote }) => { const done = completed.some(({ execution }) => execution.outputToken === quote.outputToken); const active = activeToken === quote.outputToken; return <div key={quote.outputToken} className="flex items-center justify-between rounded-lg bg-muted p-3 text-xs font-bold"><span>{quote.outputToken} swap</span><span className={done ? "text-primary" : active ? "text-warning" : "text-muted-foreground"}>{done ? "Confirmed" : active ? "Submitting" : "Queued"}</span></div>; })}</div> : null}
        {error ? <p className="mt-3 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : null}
        {phase === "review" ? <><button type="button" onClick={executeBasket} className="focus-ring pressable mt-5 min-h-12 w-full rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">Confirm investment</button><button type="button" onClick={reset} className="focus-ring pressable mt-2 min-h-11 w-full rounded-[var(--radius-control)] px-4 text-sm font-bold text-muted-foreground">Cancel</button></> : <div className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-secondary text-sm font-bold"><LoaderCircle className="animate-spin" aria-hidden="true" size={17} /> Submitting reviewed swaps</div>}
      </PanelShell>
    );
  }

  return (
    <form onSubmit={requestQuotes} noValidate className="rounded-[var(--radius-card)] border border-border bg-card p-5 md:p-6">
      <h2 className="text-lg font-extrabold tracking-[-0.02em]">Buy basket</h2>
      <div className="mt-5">
        <label htmlFor={`swap-basket-amount-${basket.slug}`} className="text-sm font-bold">You invest</label>
        <div className="mt-2 flex min-h-14 items-center rounded-[var(--radius-control)] border border-input bg-background px-4 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"><input ref={inputRef} id={`swap-basket-amount-${basket.slug}`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={error ? "true" : undefined} aria-describedby={error ? `swap-basket-error-${basket.slug}` : `swap-basket-hint-${basket.slug}`} className="min-w-0 flex-1 bg-transparent font-mono text-xl font-bold tabular-nums outline-none" /><span className="text-sm font-bold text-muted-foreground">USDC</span></div>
        {error ? <p id={`swap-basket-error-${basket.slug}`} className="mt-2 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : <p id={`swap-basket-hint-${basket.slug}`} className="mt-2 text-xs leading-5 text-muted-foreground">Review live prices for every asset before you sign.</p>}
      </div>
      {wallet.status !== "ready" ? <button type="button" onClick={recoverWallet} disabled={wallet.status === "loading" || wallet.status === "unconfigured" || wallet.actionPending} aria-busy={wallet.actionPending || wallet.status === "loading"} className="focus-ring pressable mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-60"><Wallet aria-hidden="true" size={17} /> {walletLabel}</button> : <button type="submit" disabled={phase === "quoting"} aria-busy={phase === "quoting"} className="focus-ring pressable mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-70">{phase === "quoting" ? <><LoaderCircle className="animate-spin" aria-hidden="true" size={17} /> Getting quotes…</> : "Review live quote"}</button>}
    </form>
  );
}

function PanelShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return <section className="rounded-[var(--radius-card)] border border-border bg-card p-5 md:p-6" aria-live="polite"><div className="flex items-baseline justify-between gap-4"><h2 className="text-lg font-extrabold tracking-[-0.02em]">{title}</h2><span className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.09em] text-primary">{eyebrow}</span></div><div className="mt-5">{children}</div></section>;
}

function AmountRow({ label, value, token, tokenPriceUsd, compact = false }: { label: string; value: string | null; token: string; tokenPriceUsd?: number; compact?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-4 ${compact ? "py-2" : "py-3"}`}><dt className={`${compact ? "text-xs" : "text-sm"} font-semibold capitalize text-muted-foreground`}>{label}</dt><dd className="text-right"><FormattedNumber value={value == null ? null : Number(value)} type="token_amount" context="detailed" tokenPriceUsd={tokenPriceUsd} className="font-bold" /><span className="ml-1.5 text-xs text-muted-foreground">{token}</span></dd></div>;
}
