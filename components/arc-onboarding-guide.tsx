"use client";

import { useState } from "react";
import { Check, Clipboard, ExternalLink, RefreshCw, Wallet } from "lucide-react";
import { useArcWallet } from "@/components/arc-wallet-context";
import { FormattedNumber } from "@/components/formatted-number";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ArcOnboardingGuide() {
  const wallet = useArcWallet();
  const [copied, setCopied] = useState(false);
  const hasCircleWallet = Boolean(wallet.address);
  const funded = hasCircleWallet && (wallet.balance ?? 0) > 0;
  if (funded || wallet.status === "unconfigured") return null;

  async function advanceWallet() {
    if (wallet.status === "signed-out") await wallet.createWallet();
    else if (wallet.status === "wallet-missing") await wallet.createWallet();
    else if (wallet.status === "wrong-chain") await wallet.switchToArc();
  }

  async function copyAddress() {
    if (!wallet.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  const walletReady = hasCircleWallet;
  const loading = wallet.status === "loading" || wallet.actionPending;
  const actionLabel = wallet.status === "wallet-missing" ? "Retry Circle wallet" : wallet.status === "wrong-chain" ? "Switch to Arc" : wallet.status === "loading" ? "Loading wallet…" : "Create passkey wallet";

  return (
    <section className="mt-8 rounded-[var(--radius-card)] border border-border bg-card p-5 md:p-6" aria-labelledby="onboarding-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primary">First investment</p>
          <h2 id="onboarding-title" className="mt-2 text-xl font-extrabold">Prepare your Arc wallet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Explore every strategy without signing in. Connect only when you are ready to request live quotes.</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">Arc Testnet</span>
      </div>

      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        <Step number="1" title="Create execution wallet" complete={walletReady} description="A device passkey controls your user-owned Circle modular wallet on Arc and Base." />
        <Step number="2" title="Fund this exact wallet" complete={funded} description="Send Faucet USDC to the Circle wallet address. Circle Gas Station sponsors supported transaction fees." />
        <Step number="3" title="Review a basket" complete={false} description="Request fresh quotes, inspect every protocol step, then approve the required passkey operations." />
      </ol>

      {!hasCircleWallet ? (
        <button type="button" onClick={() => void advanceWallet()} disabled={loading} aria-busy={loading} className="focus-ring mt-5 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-60">
          <Wallet aria-hidden="true" size={16} /> {actionLabel}
        </button>
      ) : (
        <div className="mt-5 rounded-xl bg-muted p-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Fund this Circle execution wallet</p>
          <p className="mt-2 break-all font-mono text-sm font-bold">{wallet.address}</p>
          <p className="mt-2 text-xs text-muted-foreground">Detected balance: <FormattedNumber value={wallet.balance} type="token_amount" context="detailed" tokenPriceUsd={1} className="font-bold text-foreground" /> USDC</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void copyAddress()} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold text-secondary-foreground">
            {copied ? <Check aria-hidden="true" size={16} className="text-primary" /> : <Clipboard aria-hidden="true" size={16} />}
            {copied ? "Address copied" : `Copy ${shortAddress(wallet.address ?? "")}`}
          </button>
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">Get test USDC <ExternalLink aria-hidden="true" size={15} /></a>
          <button type="button" onClick={() => void wallet.refreshBalance()} disabled={wallet.balanceLoading} aria-busy={wallet.balanceLoading} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-4 text-sm font-bold text-muted-foreground disabled:cursor-wait disabled:opacity-60"><RefreshCw aria-hidden="true" size={15} className={wallet.balanceLoading ? "animate-spin" : ""} /> Check balance</button>
          {wallet.status === "wrong-chain" ? <button type="button" onClick={() => void wallet.switchToArc()} disabled={loading} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-warning px-4 text-sm font-extrabold text-primary-foreground"><RefreshCw aria-hidden="true" size={15} /> Switch to Arc to invest</button> : null}
          </div>
        </div>
      )}
      {wallet.error ? <p className="mt-3 text-xs font-semibold leading-5 text-destructive" role="alert">{wallet.error}</p> : null}
    </section>
  );
}

function Step({ number, title, description, complete }: { number: string; title: string; description: string; complete: boolean }) {
  return <li className="rounded-xl bg-muted p-4"><div className="flex items-center gap-2"><span className={`grid size-7 place-items-center rounded-full font-mono text-xs font-bold ${complete ? "bg-accent text-accent-foreground" : "bg-surface-strong text-muted-foreground"}`}>{complete ? <Check aria-hidden="true" size={14} /> : number}</span><h3 className="text-sm font-extrabold">{title}</h3></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{description}</p></li>;
}
