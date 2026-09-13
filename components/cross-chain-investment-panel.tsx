"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Check, LoaderCircle, Route, ShieldCheck, Wallet } from "lucide-react";
import { formatUnits, parseUnits, type EIP1193Provider } from "viem";
import { useArcWallet } from "@/components/arc-wallet-context";
import { FormattedNumber } from "@/components/formatted-number";
import { quoteArcEarnDeposit } from "@/lib/arc-earn-client";
import { quoteBaseUniswapSwap, readBaseWalletPreflight, type BaseLpExecution } from "@/lib/base-uniswap-client";
import { allocateBasketAmount, parseBasketUsdcAmount } from "@/lib/basket-amount";
import type { Basket } from "@/lib/baskets";
import { quoteCctpBridge } from "@/lib/cctp-client";
import { createRoute, readRoute, type RouteRecord } from "@/lib/cross-chain-route";
import { entryRouteStage, executeEntryRoute, type EntryPlan } from "@/lib/cross-chain-route-execution";

type Phase = "entry" | "quoting" | "review" | "executing" | "partial" | "success";
const MIN_CROSS_CHAIN_USDC = 10;
const MAX_CROSS_CHAIN_USDC = 100;

function executionError(error: unknown, stage: number) {
  const original = error instanceof Error ? error.message.trim() : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("reject") || message.includes("denied") || message.includes("cancel")) return stage ? "Signing stopped after completed steps. Resume from the next unfinished step." : "Investment cancelled before funds moved.";
  if (message.includes("insufficient") || message.includes("funds")) return "The Circle wallet needs enough Arc USDC to complete this route.";
  if (message.includes("max fee") || message.includes("at least 1.5")) return "Use at least 10 USDC. The 20% Base sleeve must exceed Arc CCTP’s maximum-fee boundary.";
  if (message.includes("source-paid") || message.includes("feepayment")) return "The Arc CCTP route used an unsupported fee mode. Reload the updated application and request a new route.";
  if (message.includes("safety band")) return "The Base USDC/WETH pool price is outside the Testnet safety band, so the route is paused.";
  if (message.includes("quote") && message.includes("expir")) return "The CCTP quote expired before signing. Resume to request a fresh quote.";
  if (message.includes("bridge") || message.includes("attestation") || message.includes("mint")) return "CCTP did not finish. Resume uses Circle’s recorded result and will not repeat a completed burn.";
  if (message.includes("swap") || message.includes("liquidity")) return "The Base Uniswap step could not complete at the protected minimum. Completed Arc and CCTP steps remain recorded.";
  return stage ? "Execution paused after completed steps. Review the route and resume the unfinished step." : original ? `Route preflight failed: ${original}` : "The cross-chain plan could not start. No completed step was recorded.";
}

function computeRetained(total: string, morpho: string, bridgeDebit: string) {
  const retained = parseUnits(total, 6) - parseUnits(morpho, 6) - parseUnits(bridgeDebit, 6);
  return formatUnits(retained > 0n ? retained : 0n, 6);
}

export function CrossChainInvestmentPanel({ basket }: { basket: Basket }) {
  const wallet = useArcWallet();
  const [amount, setAmount] = useState("10");
  const [phase, setPhase] = useState<Phase>("entry");
  const [plan, setPlan] = useState<EntryPlan | null>(null);
  const [stage, setStage] = useState(0);
  const [lpResult, setLpResult] = useState<BaseLpExecution | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const route = useRef<RouteRecord<EntryPlan> | null>(null);
  const recoveryBlocked = useRef(false);
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(false);

  useEffect(() => {
    const recovery = requestAnimationFrame(() => {
    route.current = null;
    recoveryBlocked.current = false;
    setSubmissionUnknown(false); setRecoveryUnavailable(false);
    setPlan(null); setStage(0); setPhase("entry"); setError("");
    if (!wallet.address || !wallet.baseAddress) return;
    try {
      const saved = readRoute<EntryPlan>(wallet.address, wallet.baseAddress, "entry:" + basket.slug);
      if (saved && !saved.complete) {
        setSubmissionUnknown(Boolean(saved.pending));
        route.current = saved; setPlan(saved.plan); setStage(entryRouteStage(saved)); setPhase("partial");
        setError(saved.pending ? "A submission was interrupted. Its outcome must be checked in wallet history before continuing; it will not be repeated automatically." : "Recovered your saved route. Resume the next unfinished step.");
      }
    } catch (cause) { recoveryBlocked.current = true; setRecoveryUnavailable(true); setError(cause instanceof Error ? cause.message : "Route recovery is unavailable."); }
    });
    return () => cancelAnimationFrame(recovery);
  }, [wallet.address, wallet.baseAddress, basket.slug]);

  async function provider() {
    if (!wallet.getEthereumProvider) throw new Error("Sign in to the Circle wallet first.");
    return await wallet.getEthereumProvider() as EIP1193Provider;
  }

  async function ensureArc() {
    if (wallet.status === "signed-out") { wallet.login(); return false; }
    if (wallet.status === "wallet-missing") { await wallet.createWallet(); return false; }
    if (wallet.status !== "ready") await wallet.switchToArc();
    return true;
  }

  function reset() {
    setPhase("entry");
    setPlan(null);
    setStage(0);
    setError("");
    setLpResult(null);
    route.current = null;
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function requestPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoveryBlocked.current) return;
    setError("");
    let parsed: bigint;
    try {
      parsed = parseBasketUsdcAmount(amount);
      if (Number(amount) < MIN_CROSS_CHAIN_USDC) throw new Error(`Use at least ${MIN_CROSS_CHAIN_USDC} USDC. The 20% Base sleeve must exceed Arc CCTP’s maximum-fee boundary.`);
      if (Number(amount) > MAX_CROSS_CHAIN_USDC) throw new Error(`This experimental route is capped at ${MAX_CROSS_CHAIN_USDC} USDC.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a valid USDC amount.");
      inputRef.current?.focus();
      return;
    }
    if (!(await ensureArc())) return;
    if (!wallet.address || !wallet.baseAddress) return;
    if (wallet.balance != null && Number(amount) > wallet.balance) {
      setError("Your Arc wallet does not have enough USDC for the basket and bridge fee.");
      return;
    }
    const allocations = allocateBasketAmount(basket.legs, parsed);
    const morpho = allocations.find(({ leg }) => leg.execution === "app-kit-earn")?.value;
    const base = allocations.find(({ leg }) => leg.execution === "cctp-uniswap-v3")?.value;
    if (!morpho || !base) throw new Error("The cross-chain basket allocation is incomplete.");
    setPhase("quoting");
    try {
      const walletProvider = await provider();
      const [earn, bridge, baseWallet] = await Promise.all([
        quoteArcEarnDeposit(walletProvider, morpho),
        quoteCctpBridge(walletProvider, "arc-to-base", wallet.baseAddress, base),
        readBaseWalletPreflight(wallet.baseAddress),
      ]);
      const swapUsdc = formatUnits(parseUnits(bridge.amountReceived, 6) / 2n, 6);
      const swap = await quoteBaseUniswapSwap(swapUsdc);
      setPlan({ basketVersion: basket.version, earn, bridge, swap, baseStartingUsdc: baseWallet.usdc, total: formatUnits(parsed, 6), morpho, base, swapUsdc, retained: computeRetained(formatUnits(parsed, 6), morpho, bridge.totalDebit) });
      setPhase("review");
    } catch (cause) {
      setError(executionError(cause, 0));
      setPhase("entry");
    }
  }

  async function execute() {
    if (!plan || !wallet.address || !wallet.baseAddress || lock.current || recoveryBlocked.current) return;
    lock.current = true;
    setError(""); setPhase("executing");
    try {
      const saved = route.current ?? createRoute(wallet.address, wallet.baseAddress, "entry:" + basket.slug, plan);
      route.current = saved;
      setPlan(saved.plan);
      const result = await executeEntryRoute(saved, { provider, switchToArc: wallet.switchToArc, switchToBase: wallet.switchToBase }, setStage);
      setLpResult(result); setPhase("success");
      void wallet.switchToArc().then(() => wallet.refreshBalance()).catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Execution paused. Saved steps will not be repeated.");
      setSubmissionUnknown(Boolean(route.current?.pending));
      setPhase(route.current ? "partial" : "review");
    } finally { lock.current = false; }
  }

  const walletLabel = wallet.status === "wrong-chain" ? "Switch to Arc" : wallet.status === "wallet-missing" ? "Retry Circle wallet" : wallet.status === "signed-out" ? "Sign in with passkey" : "Loading wallet…";

  if (phase === "success" && lpResult) {
    return <Panel title="Position created" eyebrow="BASE SEPOLIA"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"><Check aria-hidden="true" size={18} /></span><div><p className="text-sm font-bold">Uniswap V3 position #{lpResult.tokenId}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">CCTP delivered canonical USDC, and the wide-range LP NFT remains in your Circle wallet.</p></div></div><div className="mt-5 grid gap-2"><a href={lpResult.explorerUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">View Base receipt <ArrowUpRight aria-hidden="true" size={15} /></a><Link href="/positions" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold">View portfolio</Link><button type="button" onClick={reset} className="focus-ring min-h-11 rounded-[var(--radius-control)] px-4 text-sm font-bold text-muted-foreground">Invest again</button></div></Panel>;
  }

  if ((phase === "review" || phase === "executing" || phase === "partial") && plan) {
    return <Panel title={phase === "review" ? "Review cross-chain plan" : phase === "partial" ? "Route paused" : "Executing route"} eyebrow="EXPERIMENTAL"><dl className="divide-y divide-border rounded-xl bg-muted px-4"><Row label="Total investment" value={plan.total} token="USDC" /><Row label="Morpho on Arc" value={plan.morpho} token="USDC" /><Row label="CCTP to Base" value={plan.base} token="USDC" /><Row label="Estimated bridge fee" value={plan.bridge.feeTotal} token="USDC" /><Row label="Estimated Arc reserve" value={plan.retained} token="USDC" /><Row label="Uniswap swap" value={plan.swapUsdc} token="USDC" /><Row label="Minimum WETH" value={plan.swap.minimumOutput} token="WETH" price={plan.swap.minimumOutput === "0" ? undefined : Number(plan.swapUsdc) / Number(plan.swap.minimumOutput)} /></dl><div className="mt-4 space-y-2">{["Deposit to Morpho on Arc", "Bridge USDC with CCTP", "Swap half to WETH on Base", "Mint wide-range Uniswap V3 NFT"].map((label, index) => <div key={label} className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-surface-strong px-3 text-xs"><span className="font-bold">{label}</span><span className={`font-bold ${stage > index ? "text-primary" : phase === "executing" && stage === index ? "text-warning" : "text-muted-foreground"}`}>{stage > index ? "Confirmed" : phase === "executing" && stage === index ? "Submitting" : "Ready"}</span></div>)}</div><div className="mt-4 flex gap-2 rounded-xl bg-warning/10 p-3 text-xs leading-5 text-muted-foreground"><AlertTriangle className="mt-0.5 shrink-0 text-warning" aria-hidden="true" size={16} /><p>Approve each sponsored passkey operation as the route advances across Arc, CCTP and Base. The strategy exposes 20% to WETH and impermanent loss and may take several minutes while CCTP attests the bridge.</p></div>{error ? <p className="mt-4 text-xs font-semibold leading-5 text-destructive" role="alert">{error}</p> : null}{phase !== "executing" ? <><button type="button" onClick={() => void execute()} disabled={submissionUnknown} className="disabled:opacity-60 focus-ring mt-5 min-h-12 w-full rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">{submissionUnknown ? "Check interrupted submission in wallet history" : phase === "partial" ? "Resume unfinished step" : "Confirm cross-chain investment"}</button>{phase === "review" ? <button type="button" onClick={reset} className="focus-ring mt-2 min-h-11 w-full rounded-[var(--radius-control)] px-4 text-sm font-bold text-muted-foreground">Cancel</button> : null}</> : <div className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-secondary text-sm font-bold"><LoaderCircle className="animate-spin" aria-hidden="true" size={17} /> Submitting reviewed route</div>}</Panel>;
  }

  return <form onSubmit={requestPlan} noValidate className="rounded-[var(--radius-card)] border border-border bg-card p-5 md:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-concept/10 text-concept"><Route aria-hidden="true" size={18} /></span><div><h2 className="text-lg font-extrabold tracking-[-0.02em]">Buy cross-chain basket</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">One capped route across Arc, CCTP and Base Uniswap.</p></div></div><div className="mt-5"><label htmlFor="cross-chain-amount" className="text-sm font-bold">You invest</label><div className="mt-2 flex min-h-14 items-center rounded-[var(--radius-control)] border border-input bg-background px-4 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"><input ref={inputRef} id="cross-chain-amount" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={error ? "true" : undefined} aria-describedby="cross-chain-hint" className="min-w-0 flex-1 bg-transparent font-mono text-xl font-bold tabular-nums outline-none" /><span className="text-sm font-bold text-muted-foreground">USDC</span></div><p id="cross-chain-hint" className={`mt-2 text-xs leading-5 ${error ? "font-semibold text-destructive" : "text-muted-foreground"}`} role={error ? "alert" : undefined}>{error || `Testnet minimum ${MIN_CROSS_CHAIN_USDC} USDC · maximum ${MAX_CROSS_CHAIN_USDC} USDC.`}</p></div>{wallet.status !== "ready" ? <button type="button" onClick={() => void ensureArc()} disabled={wallet.actionPending || wallet.status === "loading" || wallet.status === "unconfigured"} aria-busy={wallet.actionPending} className="focus-ring mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:opacity-60"><Wallet aria-hidden="true" size={17} />{walletLabel}</button> : <button type="submit" disabled={phase === "quoting" || recoveryUnavailable} aria-busy={phase === "quoting"} className="focus-ring mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:opacity-60">{phase === "quoting" ? <><LoaderCircle className="animate-spin" aria-hidden="true" size={17} />Building live route…</> : "Review live route"}</button>}<div className="mt-4 flex gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 shrink-0 text-primary" aria-hidden="true" size={15} /><p>Canonical USDC only. Exact approvals and a 1% minimum-output boundary protect the Uniswap transactions.</p></div></form>;
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return <section className="rounded-[var(--radius-card)] border border-border bg-card p-5 md:p-6" aria-live="polite"><div className="flex items-baseline justify-between gap-4"><h2 className="text-lg font-extrabold tracking-[-0.02em]">{title}</h2><span className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.09em] text-warning">{eyebrow}</span></div><div className="mt-5">{children}</div></section>;
}

function Row({ label, value, token, price = 1 }: { label: string; value: string; token: string; price?: number }) {
  return <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className="text-right"><FormattedNumber value={Number(value)} type="token_amount" context="detailed" tokenPriceUsd={price} className="font-bold" /><span className="ml-1.5 text-xs text-muted-foreground">{token}</span></dd></div>;
}
