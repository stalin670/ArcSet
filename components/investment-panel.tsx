"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Info, LoaderCircle, RotateCcw, ShieldCheck, Wallet } from "lucide-react";
import type { EIP1193Provider } from "viem";
import { useArcWallet } from "@/components/arc-wallet-context";
import { CompositeInvestmentPanel } from "@/components/composite-investment-panel";
import { CrossChainInvestmentPanel } from "@/components/cross-chain-investment-panel";
import { CrossChainPositionManager } from "@/components/cross-chain-position-manager";
import { EarnInvestmentPanel } from "@/components/earn-investment-panel";
import { FormattedNumber } from "@/components/formatted-number";
import { SwapBasketInvestmentPanel } from "@/components/swap-basket-investment-panel";
import {
  executeUsdcToEurc,
  quoteUsdcToEurc,
  RESERVE_CURRENCY_SLIPPAGE_BPS,
  type ArcSwapExecution,
  type ArcSwapQuote,
} from "@/lib/arc-swap-client";
import { allocateBasketAmount, parseBasketUsdcAmount } from "@/lib/basket-amount";
import { ARC_TESTNET } from "@/lib/arc";
import type { Basket } from "@/lib/baskets";
import { recordBasketPosition } from "@/lib/positions";

const QUOTE_TTL_MS = 30_000;

type PanelPhase = "entry" | "preview" | "quoting" | "review" | "executing" | "success";

function userFacingSwapError(error: unknown, action: "quote" | "execute") {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("reject") || message.includes("denied") || message.includes("cancel")) {
    return "Investment cancelled. No additional action is required.";
  }
  if (message.includes("insufficient")) return "Insufficient USDC for the swap and its network fee.";
  if (message.includes("route") || message.includes("liquidity")) return "No executable USDC/EURC route is available for this amount right now.";
  return action === "quote"
    ? "Couldn’t get a live Arc quote. Try again in a moment."
    : "The swap could not be submitted. No unconfirmed result has been recorded.";
}

export function InvestmentPanel({ basket }: { basket: Basket }) {
  if (basket.strategyType === "cross-chain") return <div className="space-y-4"><CrossChainInvestmentPanel basket={basket} /><CrossChainPositionManager /></div>;
  if (basket.strategyType === "earn") return <EarnInvestmentPanel basket={basket} />;
  if (basket.strategyType === "composite") return <CompositeInvestmentPanel basket={basket} />;
  if (basket.executionAvailability === "live" && basket.legs.some((leg) => leg.symbol === "cirBTC")) {
    return <SwapBasketInvestmentPanel basket={basket} />;
  }
  return <AssetInvestmentPanel basket={basket} />;
}

function AssetInvestmentPanel({ basket }: { basket: Basket }) {
  const wallet = useArcWallet();
  const [amount, setAmount] = useState("10");
  const [microUsdc, setMicroUsdc] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<PanelPhase>("entry");
  const [quote, setQuote] = useState<ArcSwapQuote | null>(null);
  const [execution, setExecution] = useState<ArcSwapExecution | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const executionPendingRef = useRef(false);
  const isExecutable = basket.executionAvailability === "live";
  const walletActionLabel = wallet.status === "wrong-chain"
    ? "Switch to Arc"
    : wallet.status === "wallet-missing"
      ? "Create Arc wallet"
      : wallet.status === "loading"
        ? "Loading wallet…"
        : wallet.status === "unconfigured"
          ? "Wallet unavailable"
          : "Sign in to invest";
  const allocations = useMemo(
    () => microUsdc == null ? [] : allocateBasketAmount(basket.legs, microUsdc),
    [basket, microUsdc],
  );

  async function getProvider() {
    if (wallet.status !== "ready" || !wallet.getEthereumProvider) {
      throw new Error("Sign in to your Arc wallet before requesting a quote.");
    }
    return await wallet.getEthereumProvider() as EIP1193Provider;
  }

  async function recoverWallet() {
    if (wallet.status === "signed-out") wallet.login();
    else if (wallet.status === "wallet-missing") await wallet.createWallet();
    else if (wallet.status === "wrong-chain") await wallet.switchToArc();
  }

  function resetPanel() {
    setPhase("entry");
    setQuote(null);
    setExecution(null);
    setMicroUsdc(null);
    setError("");
    executionPendingRef.current = false;
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    let parsed: bigint;
    try {
      parsed = parseBasketUsdcAmount(amount);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Enter a valid USDC amount.");
      inputRef.current?.focus();
      return;
    }

    setMicroUsdc(parsed);
    if (!isExecutable) {
      setPhase("preview");
      return;
    }
    if (wallet.status !== "ready") {
      await recoverWallet();
      return;
    }
    if (wallet.balance != null && Number(amount) > wallet.balance) {
      setError("Your Arc wallet does not have enough USDC for this basket amount.");
      inputRef.current?.focus();
      return;
    }

    setPhase("quoting");
    try {
      const provider = await getProvider();
      const eurcAllocation = allocateBasketAmount(basket.legs, parsed).find(({ leg }) => leg.symbol === "EURC");
      if (!eurcAllocation) throw new Error("This basket has no EURC allocation.");
      const nextQuote = await quoteUsdcToEurc(provider, eurcAllocation.value);
      setQuote(nextQuote);
      setPhase("review");
    } catch (quoteError) {
      setError(userFacingSwapError(quoteError, "quote"));
      setPhase("entry");
    }
  }

  async function executeInvestment() {
    if (!quote || executionPendingRef.current) return;
    setError("");
    if (Date.now() - quote.quotedAt > QUOTE_TTL_MS) {
      setError("This quote expired. Return and request a fresh quote before investing.");
      return;
    }

    executionPendingRef.current = true;
    setPhase("executing");
    try {
      const provider = await getProvider();
      const result = await executeUsdcToEurc(provider, quote);
      const retainedUsdc = allocations.find(({ leg }) => leg.symbol === "USDC")?.value ?? "0";
      if (wallet.address) {
        recordBasketPosition({
          schemaVersion: 2,
          id: result.txHash.toLowerCase(),
          walletAddress: wallet.address,
          basketSlug: basket.slug,
          basketVersion: basket.version,
          chainId: ARC_TESTNET.id,
          investedUsdc: amount,
          retainedUsdc,
          status: result.status === "DONE" ? "complete" : "pending",
          legs: [{
            name: "Euro Coin",
            outputToken: "EURC",
            amountInUsdc: quote.amountIn,
            outputAmount: result.amountOut ?? quote.estimatedOutput,
            outputAmountSource: result.amountOut ? "actual" : "estimated",
            transactionHash: result.txHash as `0x${string}`,
            status: result.status === "DONE" ? "complete" : "pending",
          }],
          createdAt: Date.now(),
        });
      }
      setExecution(result);
      setPhase("success");
      await wallet.refreshBalance();
    } catch (executeError) {
      setError(userFacingSwapError(executeError, "execute"));
      setPhase("review");
    } finally {
      executionPendingRef.current = false;
    }
  }

  if (phase === "success" && execution) {
    return (
      <PanelShell title="Investment submitted" eyebrow={execution.status}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"><Check aria-hidden="true" size={19} /></span>
          <p className="text-sm leading-6 text-muted-foreground">The USDC/EURC swap was submitted from your Circle wallet. Retained USDC stays in the same wallet.</p>
        </div>
        {execution.amountOut ? (
          <p className="mt-5 rounded-xl bg-muted p-4 text-sm">Received approximately <FormattedNumber value={Number(execution.amountOut)} type="token_amount" context="detailed" tokenPriceUsd={1} className="font-bold" /> EURC</p>
        ) : null}
        <div className="mt-5 grid gap-2">
          <Link href="/positions" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">View position</Link>
          {execution.explorerUrl ? <a href={execution.explorerUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold text-secondary-foreground">View transaction <ArrowUpRight aria-hidden="true" size={16} /></a> : null}
          <button type="button" onClick={resetPanel} className="focus-ring min-h-11 rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold">Start another preview</button>
        </div>
      </PanelShell>
    );
  }

  if ((phase === "review" || phase === "executing") && quote && microUsdc != null) {
    const usdcAllocation = allocations.find(({ leg }) => leg.symbol === "USDC");
    return (
      <PanelShell title="Review investment" eyebrow={`VERSION ${basket.version}`}>
        <dl className="divide-y divide-border rounded-xl bg-muted px-4">
          <QuoteRow label="Basket amount" value={amount} token="USDC" />
          {usdcAllocation ? <QuoteRow label="Keep in wallet" value={usdcAllocation.value} token="USDC" /> : null}
          <QuoteRow label="Swap" value={quote.amountIn} token="USDC" />
          <QuoteRow label="Expected" value={quote.estimatedOutput} token={quote.outputToken} />
          <QuoteRow label="Minimum received" value={quote.minimumOutput} token={quote.outputToken} />
        </dl>
        {quote.fees.length ? (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Estimated fees</p>
            <dl className="mt-2">
              {quote.fees.map((fee, index) => <QuoteRow key={`${fee.type}-${index}`} label={fee.type} value={fee.amount} token={fee.token} compact />)}
            </dl>
          </div>
        ) : null}
        <div className="mt-4 flex gap-2 rounded-xl bg-concept/10 p-3 text-xs leading-5 text-concept">
          <ShieldCheck className="mt-0.5 shrink-0" aria-hidden="true" size={16} />
          <p>Minimum output is protected at {RESERVE_CURRENCY_SLIPPAGE_BPS / 100}% slippage. Circle batches the approval and swap into one sponsored passkey operation when both calls are required.</p>
        </div>
        {error ? <p className="mt-3 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : null}
        <button type="button" onClick={executeInvestment} disabled={phase === "executing"} aria-busy={phase === "executing"} className="focus-ring mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-70">
          {phase === "executing" ? <><LoaderCircle className="animate-spin" aria-hidden="true" size={17} /> Submitting investment…</> : "Confirm and invest"}
        </button>
        <button type="button" onClick={resetPanel} disabled={phase === "executing"} className="focus-ring mt-2 min-h-11 w-full rounded-[var(--radius-control)] px-4 text-sm font-bold text-muted-foreground disabled:opacity-60">Cancel</button>
      </PanelShell>
    );
  }

  if (phase === "preview" && microUsdc != null) {
    const explanation = "This basket does not have a fully verified entry and exit lifecycle yet. Previewing it does not move funds.";
    return (
      <PanelShell title="Allocation preview" eyebrow="PREVIEW ONLY">
        <dl className="divide-y divide-border rounded-xl bg-muted px-4">
          {allocations.map(({ leg, value }) => <QuoteRow key={leg.symbol} label={leg.symbol} value={value} token="USDC value" />)}
        </dl>
        <div className="mt-4 flex gap-2 rounded-xl bg-concept/10 p-3 text-sm leading-6 text-concept"><Info className="mt-0.5 shrink-0" aria-hidden="true" size={17} /><p>{explanation}</p></div>
        <button type="button" onClick={resetPanel} className="focus-ring mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold"><RotateCcw aria-hidden="true" size={16} /> Change amount</button>
      </PanelShell>
    );
  }

  const submitLabel = phase === "quoting" ? "Getting quote…" : isExecutable ? "Review live quote" : "Preview allocation";
  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-[var(--radius-card)] border border-border bg-card p-5 md:p-6">
      <h2 className="text-lg font-extrabold tracking-[-0.02em]">{isExecutable ? "Buy basket" : "Preview allocation"}</h2>
      <div className="mt-5">
        <label htmlFor="investment-amount" className="text-sm font-bold">You invest</label>
        <div className="mt-2 flex min-h-14 items-center rounded-[var(--radius-control)] border border-input bg-background px-4 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
          <input ref={inputRef} id="investment-amount" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={error ? "true" : undefined} aria-describedby={error ? "investment-amount-error" : "investment-amount-hint"} className="min-w-0 flex-1 bg-transparent font-mono text-xl font-bold tabular-nums outline-none" />
          <span className="text-sm font-bold text-muted-foreground">USDC</span>
        </div>
        {error ? <p id="investment-amount-error" className="mt-2 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : <p id="investment-amount-hint" className="mt-2 text-xs leading-5 text-muted-foreground">{isExecutable ? "Quote the EURC leg before reviewing the transaction." : "Inspect target values without moving funds."}</p>}
      </div>
      {wallet.status !== "ready" && isExecutable ? (
        <button type="button" onClick={recoverWallet} disabled={wallet.status === "loading" || wallet.status === "unconfigured" || wallet.actionPending} aria-busy={wallet.actionPending || wallet.status === "loading"} className="focus-ring mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-60"><Wallet aria-hidden="true" size={17} /> {walletActionLabel}</button>
      ) : (
        <button type="submit" disabled={phase === "quoting"} aria-busy={phase === "quoting"} className="focus-ring mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-70">{phase === "quoting" ? <LoaderCircle className="animate-spin" aria-hidden="true" size={17} /> : null}{submitLabel}</button>
      )}
    </form>
  );
}

function PanelShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-card p-5 md:p-6" aria-live="polite">
      <div className="flex items-baseline justify-between gap-4"><h2 className="text-lg font-extrabold tracking-[-0.02em]">{title}</h2><span className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.09em] text-primary">{eyebrow}</span></div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function QuoteRow({ label, value, token, compact = false }: { label: string; value: string | null; token: string; compact?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${compact ? "py-1" : "py-3"}`}>
      <dt className={`${compact ? "text-xs" : "text-sm"} font-semibold capitalize text-muted-foreground`}>{label}</dt>
      <dd className="text-right"><FormattedNumber value={value == null ? null : Number(value)} type="token_amount" context="detailed" tokenPriceUsd={1} className="font-bold" /><span className="ml-1.5 text-xs text-muted-foreground">{token}</span></dd>
    </div>
  );
}
