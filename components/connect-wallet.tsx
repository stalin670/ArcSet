"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clipboard,
  ExternalLink,
  Fingerprint,
  LogOut,
  RefreshCw,
  Settings,
  Wallet,
} from "lucide-react";
import { FormattedNumber } from "@/components/formatted-number";
import { useArcWallet } from "@/components/arc-wallet-context";

const COPY_FEEDBACK_MS = 2_000;

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function balanceUpdatedLabel(timestamp: number | null) {
  if (!timestamp) return "Balance not checked yet";
  return `Balance checked ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(timestamp)}`;
}

export function ConnectWallet() {
  const wallet = useArcWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  async function copyAddress() {
    if (!wallet.address) return;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      setCopyError("Couldn’t copy the address.");
    }
  }

  if (wallet.status === "unconfigured") {
    return (
      <button type="button" disabled title={wallet.error} className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-[var(--radius-control)] bg-warning/15 px-4 text-sm font-bold text-warning">
        <Settings aria-hidden="true" size={17} />
        Circle setup needed
      </button>
    );
  }

  if (wallet.status === "loading") {
    return <div className="h-11 w-36 animate-pulse rounded-[var(--radius-control)] bg-muted" aria-label="Loading wallet session" aria-busy="true" />;
  }

  if (wallet.status === "signed-out") {
    return (
      <div className="relative">
        <button ref={triggerRef} type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="wallet-onboarding-menu" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-secondary px-3 text-sm font-bold text-secondary-foreground">
          <Fingerprint aria-hidden="true" size={17} />
          Circle wallet
          <ChevronDown aria-hidden="true" size={15} className={menuOpen ? "rotate-180" : ""} />
        </button>
        {menuOpen ? (
          <div ref={menuRef} id="wallet-onboarding-menu" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-xl border border-border bg-popover p-2 shadow-2xl">
            <div className="px-3 py-2">
              <p className="text-sm font-extrabold">Use a device passkey</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Create a new Circle smart wallet or unlock one registered on this site.</p>
            </div>
            <button type="button" onClick={() => { setMenuOpen(false); void wallet.createWallet(); }} disabled={wallet.actionPending} aria-busy={wallet.actionPending} className="focus-ring mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg bg-primary px-3 text-left text-sm font-bold text-primary-foreground disabled:cursor-wait disabled:opacity-70">
              <Fingerprint aria-hidden="true" size={17} /> Create new wallet
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); wallet.login(); }} disabled={wallet.actionPending} aria-busy={wallet.actionPending} className="focus-ring mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold hover:bg-muted disabled:cursor-wait disabled:opacity-70">
              <Wallet aria-hidden="true" size={17} /> Sign in with passkey
            </button>
            {wallet.error ? <p className="mt-2 px-3 pb-1 text-xs leading-5 text-destructive" role="alert">{wallet.error}</p> : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (wallet.status === "wallet-missing") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" onClick={wallet.createWallet} disabled={wallet.actionPending} aria-busy={wallet.actionPending} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-wait disabled:opacity-70">
          <Wallet aria-hidden="true" size={17} />
          {wallet.actionPending ? "Retrying…" : "Retry Circle wallet"}
        </button>
        {wallet.error ? <span className="max-w-56 text-right text-xs text-destructive">{wallet.error}</span> : null}
      </div>
    );
  }

  if (wallet.status === "wrong-chain") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" onClick={wallet.switchToArc} disabled={wallet.actionPending} aria-busy={wallet.actionPending} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-warning px-4 text-sm font-bold text-primary-foreground disabled:cursor-wait disabled:opacity-70">
          <RefreshCw aria-hidden="true" size={17} />
          {wallet.actionPending ? "Switching…" : "Switch to Arc"}
        </button>
        {wallet.error ? <span className="max-w-56 text-right text-xs text-destructive">{wallet.error}</span> : null}
      </div>
    );
  }

  if (!wallet.address) return null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-controls="wallet-account-menu"
        className="focus-ring inline-flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] bg-secondary px-3 text-left text-sm font-semibold text-secondary-foreground"
      >
        <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"><Wallet aria-hidden="true" size={14} /></span>
        <span className="hidden sm:block">
          <span className="block text-xs font-medium text-muted-foreground">{shortAddress(wallet.address)}</span>
          {wallet.balanceLoading && wallet.balance === null ? (
            <span className="text-xs text-muted-foreground">Loading balance…</span>
          ) : (
            <><FormattedNumber value={wallet.balance} type="token_amount" context="compact" tokenPriceUsd={1} /><span className="ml-1 text-xs text-muted-foreground">USDC</span></>
          )}
        </span>
        <ChevronDown aria-hidden="true" size={15} className={menuOpen ? "rotate-180" : ""} />
      </button>

      {menuOpen ? (
        <div ref={menuRef} id="wallet-account-menu" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 rounded-xl border border-border bg-popover p-2 shadow-2xl">
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Circle modular wallet</span>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-primary"><Check aria-hidden="true" size={13} /> Arc</span>
            </div>
            <p className="mt-2 break-all font-mono text-xs leading-5 text-foreground">{wallet.address}</p>
            <p className="mt-2 text-xs text-muted-foreground">{balanceUpdatedLabel(wallet.balanceUpdatedAt)}</p>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs"><span className="text-muted-foreground">Execution mode</span><span className="font-bold text-foreground">{wallet.atomicBatchLoading ? "Preparing…" : wallet.atomicBatchSupported ? "Sponsored atomic batch" : "Unavailable"}</span></div>
          </div>

          <div className="mt-2 grid gap-1">
            <button type="button" onClick={copyAddress} className="focus-ring flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold hover:bg-muted">
              {copied ? <Check aria-hidden="true" size={17} className="text-primary" /> : <Clipboard aria-hidden="true" size={17} />}
              {copied ? "Address copied" : "Copy address"}
            </button>
            <button type="button" onClick={wallet.refreshBalance} disabled={wallet.balanceLoading} aria-busy={wallet.balanceLoading} className="focus-ring flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold hover:bg-muted disabled:cursor-wait disabled:opacity-60">
              <RefreshCw aria-hidden="true" size={17} /> {wallet.balanceLoading ? "Refreshing…" : "Refresh balance"}
            </button>
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="focus-ring flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold hover:bg-muted">
              <ExternalLink aria-hidden="true" size={17} /> Get test USDC
            </a>
            <a href={`https://testnet.arcscan.app/address/${wallet.address}`} target="_blank" rel="noreferrer" className="focus-ring flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold hover:bg-muted">
              <ExternalLink aria-hidden="true" size={17} /> View on ArcScan
            </a>
            <button type="button" onClick={wallet.logout} disabled={wallet.actionPending} aria-busy={wallet.actionPending} className="focus-ring flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-destructive hover:bg-muted disabled:cursor-wait disabled:opacity-60">
              <LogOut aria-hidden="true" size={17} /> {wallet.actionPending ? "Signing out…" : "Sign out"}
            </button>
          </div>
          {copyError || wallet.error ? <p className="mt-2 px-3 pb-1 text-xs leading-5 text-destructive" role="alert">{copyError || wallet.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
