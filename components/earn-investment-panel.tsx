"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, Check, LoaderCircle, RefreshCw, Wallet } from "lucide-react";
import type { EIP1193Provider } from "viem";
import { useArcWallet } from "@/components/arc-wallet-context";
import { FormattedNumber } from "@/components/formatted-number";
import {
  executeArcEarnQuote,
  getArcEarnPosition,
  quoteArcEarnDeposit,
  quoteArcEarnWithdrawal,
  type ArcEarnExecution,
  type ArcEarnQuote,
} from "@/lib/arc-earn-client";
import { allocateBasketAmount, parseBasketUsdcAmount } from "@/lib/basket-amount";
import { ARC_TESTNET } from "@/lib/arc";
import type { Basket } from "@/lib/baskets";
import { recordBasketPosition } from "@/lib/positions";
import { createArcExecutionState, executeArcBasketSteps } from "@/lib/arc-basket-execution";

type EarnMode = "deposit" | "withdraw";
type EarnPhase = "entry" | "quoting" | "review" | "executing" | "success";

function userFacingEarnError(error: unknown, action: "quote" | "execute" | "position") {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (error instanceof Error && message.includes("submission outcome is unknown")) return error.message;
  if (message.includes("reject") || message.includes("denied") || message.includes("cancel")) {
    return "Transaction cancelled. No unconfirmed position was recorded.";
  }
  if (message.includes("insufficient")) return "Insufficient USDC for the amount and Arc network fees.";
  if (message.includes("non-mock") || message.includes("no active")) return "No verified non-mock USDC earn vault is available on Arc Testnet right now.";
  if (message.includes("changed")) return "The active vault changed. Request a fresh quote before signing.";
  if (message.includes("liquidity") || message.includes("withdraw")) return "The vault cannot satisfy this withdrawal amount right now.";
  if (action === "position") return "Couldn’t read the current onchain earn position. Try again.";
  return action === "quote"
    ? "Couldn’t verify and quote the Arc earn vault. Try again in a moment."
    : "The earn transaction was not confirmed. Check the wallet or ArcScan before retrying.";
}

export function EarnInvestmentPanel({ basket }: { basket: Basket }) {
  const wallet = useArcWallet();
  const [mode, setMode] = useState<EarnMode>("deposit");
  const [amount, setAmount] = useState("10");
  const [phase, setPhase] = useState<EarnPhase>("entry");
  const [quote, setQuote] = useState<ArcEarnQuote | null>(null);
  const [execution, setExecution] = useState<ArcEarnExecution | null>(null);
  const [error, setError] = useState("");
  const [needsRecording, setNeedsRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const executionPendingRef = useRef(false);
  const executionState = useRef(createArcExecutionState<ArcEarnExecution>());

  async function getProvider() {
    if (wallet.status !== "ready" || !wallet.getEthereumProvider) {
      throw new Error("Sign in to your Arc wallet before using Earn.");
    }
    return await wallet.getEthereumProvider() as EIP1193Provider;
  }

  const position = useQuery({
    queryKey: ["arc-earn-position", wallet.address],
    enabled: wallet.status === "ready" && Boolean(wallet.address),
    queryFn: async () => {
      if (!wallet.address) throw new Error("The Circle wallet address is unavailable.");
      return getArcEarnPosition(wallet.address);
    },
    retry: 1,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const currentPositionBalance = Number(position.data?.currentBalance ?? 0);
  const hasPosition = currentPositionBalance > 0;
  const depositAllocation = useMemo(() => basket.legs.find((leg) => leg.execution === "app-kit-earn"), [basket]);

  async function recoverWallet() {
    if (wallet.status === "signed-out") wallet.login();
    else if (wallet.status === "wallet-missing") await wallet.createWallet();
    else if (wallet.status === "wrong-chain") await wallet.switchToArc();
  }

  function reset(nextMode: EarnMode = mode) {
    setNeedsRecording(false);
    executionState.current = createArcExecutionState<ArcEarnExecution>();
    setMode(nextMode);
    setPhase("entry");
    setQuote(null);
    setExecution(null);
    setError("");
    setAmount(nextMode === "deposit" ? "10" : position.data?.currentBalance ?? "0");
    executionPendingRef.current = false;
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

    if (mode === "deposit" && wallet.balance != null && Number(amount) > wallet.balance) {
      setError("Your Arc wallet does not have enough USDC for this basket amount and gas.");
      inputRef.current?.focus();
      return;
    }
    if (mode === "withdraw" && Number(amount) > currentPositionBalance) {
      setError("The withdrawal exceeds your current vault position.");
      inputRef.current?.focus();
      return;
    }

    setPhase("quoting");
    try {
      const provider = await getProvider();
      const nextQuote = mode === "deposit"
        ? await quoteArcEarnDeposit(
            provider,
            allocateBasketAmount(basket.legs, parsed).find(({ leg }) => leg.execution === "app-kit-earn")?.value ?? "0",
          )
        : await quoteArcEarnWithdrawal(provider, amount);
      setQuote(nextQuote);
      setPhase("review");
    } catch (quoteError) {
      setError(userFacingEarnError(quoteError, "quote"));
      setPhase("entry");
    }
  }

  async function executeQuote() {
    if (!quote || executionPendingRef.current) return;
    setError("");
    executionPendingRef.current = true;
    setPhase("executing");
    try {
      const provider = await getProvider();
      const outcome = await executeArcBasketSteps({
        state: executionState.current,
        steps: [quote],
        id: () => "earn",
        quote: async (reviewed) => reviewed.kind === "deposit" ? quoteArcEarnDeposit(provider, reviewed.amountIn) : quoteArcEarnWithdrawal(provider, reviewed.amountOut),
        execute: async (_reviewed, fresh) => ({ status: "complete" as const, value: await executeArcEarnQuote(provider, fresh) }),
        record: (outcomes) => {
          const result = outcomes[0].value;
          if (result.kind === "deposit" && quote.kind === "deposit" && wallet.address) {
            const parsed = parseBasketUsdcAmount(amount);
            const retainedUsdc = allocateBasketAmount(basket.legs, parsed).find(({ leg }) => leg.execution === "hold")?.value ?? "0";
            recordBasketPosition({
              schemaVersion: 2,
              id: result.txHash.toLowerCase(),
              walletAddress: wallet.address,
              basketSlug: basket.slug,
              basketVersion: basket.version,
              chainId: ARC_TESTNET.id,
              investedUsdc: amount,
              retainedUsdc,
              status: "complete",
              legs: [{
                name: quote.vault.name,
                outputToken: "EARN-USDC",
                amountInUsdc: quote.amountIn,
                outputAmount: result.amount,
                outputAmountSource: "actual",
                transactionHash: result.txHash,
                status: "complete",
              }],
              createdAt: Date.now(),
            });
          }
        },
      });
      const result = executionState.current.outcomes[0]?.value;
      if (!result) return;
      setExecution(result);
      setPhase("success");
      if (outcome.status === "recording-failed") setError("Transaction confirmed, but its local record could not be saved. Keep the receipt before leaving this page.");
      await Promise.all([wallet.refreshBalance(), position.refetch()]).catch(() => {
        if (outcome.status !== "recording-failed") setError("Transaction confirmed. Balance refresh is temporarily unavailable.");
      });
    } catch (executeError) {
      const confirmed = executionState.current.outcomes[0]?.value;
      if (confirmed) {
        setExecution(confirmed);
        setError("Transaction confirmed, but its local receipt still needs saving. Reconnect the wallet and retry saving.");
        setPhase("success");
      } else {
        setError(userFacingEarnError(executeError, "execute"));
        setPhase("review");
      }
    } finally {
      setNeedsRecording(Boolean(executionState.current.needsRecording));
      executionPendingRef.current = false;
    }
  }

  const walletActionLabel = wallet.status === "wrong-chain"
    ? "Switch to Arc"
    : wallet.status === "wallet-missing"
      ? "Create Arc wallet"
      : wallet.status === "loading"
        ? "Loading wallet…"
        : wallet.status === "unconfigured"
          ? "Wallet unavailable"
          : "Sign in to continue";

  if (phase === "success" && execution) {
    return (
      <PanelShell title={execution.kind === "deposit" ? "Deposit confirmed" : "Withdrawal confirmed"} eyebrow="ONCHAIN">
        {error ? <p role="alert" className="mb-4 text-sm text-destructive">{error}</p> : null}
        {needsRecording ? <button type="button" onClick={() => void executeQuote()} className="focus-ring mb-4 min-h-10 rounded-lg bg-secondary px-3 text-sm font-bold">Retry saving receipt</button> : null}
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"><Check aria-hidden="true" size={19} /></span>
          <div>
            <p className="text-sm font-bold">Real Arc position update confirmed</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground"><FormattedNumber value={Number(execution.amount)} type="token_amount" context="detailed" tokenPriceUsd={1} className="font-bold" /> USDC was {execution.kind === "deposit" ? "deposited into the verified EarnKit vault" : "withdrawn from the vault to your wallet"}.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-2">
          <a href={execution.explorerUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">View transaction <ArrowUpRight aria-hidden="true" size={16} /></a>
          <button type="button" onClick={() => reset(execution.kind === "deposit" && hasPosition ? "withdraw" : "deposit")} disabled={needsRecording} className="focus-ring min-h-11 rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold">{execution.kind === "deposit" ? "Manage position" : "Make another deposit"}</button>
        </div>
      </PanelShell>
    );
  }

  if ((phase === "review" || phase === "executing") && quote) {
    const amountValue = quote.kind === "deposit" ? quote.amountIn : quote.amountOut;
    return (
      <PanelShell title={quote.kind === "deposit" ? "Review vault deposit" : "Review vault withdrawal"} eyebrow="LIVE QUOTE">
        <dl className="divide-y divide-border rounded-xl bg-muted px-4">
          <QuoteRow label="Vault" value={quote.vault.name} />
          <QuoteRow label={quote.kind === "deposit" ? "Deposit" : "Withdraw"} value={<><FormattedNumber value={Number(amountValue)} type="token_amount" context="detailed" tokenPriceUsd={1} /> <span className="text-muted-foreground">USDC</span></>} />
          <QuoteRow label={quote.kind === "deposit" ? "Expected shares" : "Shares redeemed"} value={<FormattedNumber value={Number(quote.kind === "deposit" ? quote.expectedShares : quote.sharesToRedeem)} type="token_amount" context="detailed" tokenPriceUsd={Number(quote.sharePrice)} />} />
          <QuoteRow label="Share price" value={<><FormattedNumber value={Number(quote.sharePrice)} type="token_amount" context="detailed" tokenPriceUsd={1} /> <span className="text-muted-foreground">USDC</span></>} />
          <QuoteRow label="Current APY" value={<FormattedNumber value={quote.vault.currentApy * 100} type="percent" context="detailed" />} />
          {quote.kind === "withdraw" ? <QuoteRow label="Max withdrawable" value={<><FormattedNumber value={Number(quote.maxWithdrawable)} type="token_amount" context="detailed" tokenPriceUsd={1} /> <span className="text-muted-foreground">USDC</span></>} /> : null}
        </dl>
        {quote.gasFees.length ? (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Estimated Arc gas</p>
            <dl className="mt-2 divide-y divide-border rounded-xl bg-muted px-4">
              {quote.gasFees.map((fee) => <QuoteRow key={fee.name} label={fee.name} value={fee.amountUsdc ? <><FormattedNumber value={Number(fee.amountUsdc)} type="token_amount" context="detailed" tokenPriceUsd={1} /> <span className="text-muted-foreground">USDC</span></> : fee.error ?? "Unavailable"} />)}
            </dl>
          </div>
        ) : null}
        {quote.kind === "withdraw" && quote.warnings.length ? <div className="mt-4 rounded-xl bg-warning/10 p-3 text-xs leading-5 text-warning">{quote.warnings.join(" ")}</div> : null}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">{quote.vault.circleGuarded ? "Circle Sentinel enabled." : "Circle Sentinel not enabled on this testnet vault."} Circle batches the approval and vault call into one sponsored passkey operation when supported; progress and receipts remain visible here.</p>
        {error ? <p className="mt-3 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : null}
        <button type="button" onClick={executeQuote} disabled={phase === "executing"} aria-busy={phase === "executing"} className="focus-ring mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-70">
          {phase === "executing" ? <><LoaderCircle className="animate-spin" aria-hidden="true" size={17} /> Submitting transaction…</> : quote.kind === "deposit" ? "Confirm deposit" : "Confirm withdrawal"}
        </button>
        <button type="button" onClick={() => reset(quote.kind)} disabled={phase === "executing"} className="focus-ring mt-2 min-h-11 w-full rounded-[var(--radius-control)] px-4 text-sm font-bold text-muted-foreground disabled:opacity-60">Cancel</button>
      </PanelShell>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-[var(--radius-card)] border border-border bg-card p-5 md:p-6">
      <h2 className="text-lg font-extrabold tracking-[-0.02em]">Earn with USDC</h2>

      {wallet.status === "ready" ? (
        <div className="mt-5 rounded-xl bg-muted p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Current vault position</p>
              {position.isLoading ? <div className="mt-2 h-8 w-28 animate-pulse rounded bg-surface-strong" aria-label="Loading earn position" aria-busy="true" /> : position.isError ? <p className="mt-2 text-sm font-semibold text-destructive">{userFacingEarnError(position.error, "position")}</p> : <FormattedNumber value={currentPositionBalance} type="token_amount" context="detailed" tokenPriceUsd={1} className="mt-1 block text-2xl font-extrabold" />}
            </div>
            <button type="button" onClick={() => position.refetch()} disabled={position.isFetching} aria-label="Refresh earn position" className="focus-ring grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-secondary text-secondary-foreground disabled:cursor-wait disabled:opacity-60"><RefreshCw aria-hidden="true" size={16} className={position.isFetching ? "animate-spin" : ""} /></button>
          </div>
          {position.data ? <p className="mt-1 text-xs text-muted-foreground">USDC · <FormattedNumber value={position.data.currentApy * 100} type="percent" context="compact" /> current variable APY</p> : null}
        </div>
      ) : null}

      {hasPosition ? (
        <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Earn action">
          {(["deposit", "withdraw"] as const).map((item) => <button key={item} type="button" aria-pressed={mode === item} onClick={() => reset(item)} className={`focus-ring min-h-11 rounded-[var(--radius-control)] px-3 text-sm font-bold capitalize ${mode === item ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{item}</button>)}
        </div>
      ) : null}

      <div className="mt-5">
        <label htmlFor="earn-amount" className="text-sm font-bold">{mode === "deposit" ? "You deposit" : "You withdraw"}</label>
        <div className="mt-2 flex min-h-14 items-center rounded-[var(--radius-control)] border border-input bg-background px-4 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
          <input ref={inputRef} id="earn-amount" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={error ? "true" : undefined} aria-describedby={error ? "earn-amount-error" : "earn-amount-hint"} className="min-w-0 flex-1 bg-transparent font-mono text-xl font-bold tabular-nums outline-none" />
          <span className="text-sm font-bold text-muted-foreground">USDC</span>
        </div>
        {error ? <p id="earn-amount-error" className="mt-2 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : <p id="earn-amount-hint" className="mt-2 text-xs leading-5 text-muted-foreground">{mode === "deposit" ? `${depositAllocation?.weight ?? 0}% goes to the verified vault; the rest stays in your wallet.` : "The quote verifies shares, liquidity, fees, and the current vault before signing."}</p>}
      </div>

      {wallet.status !== "ready" ? (
        <button type="button" onClick={recoverWallet} disabled={wallet.status === "loading" || wallet.status === "unconfigured" || wallet.actionPending} aria-busy={wallet.actionPending || wallet.status === "loading"} className="focus-ring mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-60"><Wallet aria-hidden="true" size={17} /> {walletActionLabel}</button>
      ) : (
        <button type="submit" disabled={phase === "quoting" || position.isLoading} aria-busy={phase === "quoting"} className="focus-ring pressable mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-70">{phase === "quoting" ? <><LoaderCircle className="animate-spin" aria-hidden="true" size={17} /> Checking vault…</> : mode === "deposit" ? "Review deposit" : "Review withdrawal"}</button>
      )}

      {position.isError ? <button type="button" onClick={() => position.refetch()} className="focus-ring mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold"><AlertCircle aria-hidden="true" size={16} /> Retry position read</button> : null}
    </form>
  );
}

function PanelShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return <section className="rounded-[var(--radius-card)] border border-border bg-card p-5 md:p-6" aria-live="polite"><div className="flex items-baseline justify-between gap-4"><h2 className="text-lg font-extrabold tracking-[-0.02em]">{title}</h2><span className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.09em] text-primary">{eyebrow}</span></div><div className="mt-5">{children}</div></section>;
}

function QuoteRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4 py-3"><dt className="text-sm font-semibold text-muted-foreground">{label}</dt><dd className="max-w-[60%] text-right text-sm font-bold">{value}</dd></div>;
}
