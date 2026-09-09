"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, RefreshCw, Wallet } from "lucide-react";
import { useArcWallet } from "@/components/arc-wallet-context";

export function LandingGetStarted() {
  const router = useRouter();
  const wallet = useArcWallet();
  const [flowStarted, setFlowStarted] = useState(false);
  const attemptedRecovery = useRef(new Set<string>());

  useEffect(() => {
    if (!flowStarted || wallet.actionPending) return;
    if (wallet.status === "ready") {
      router.replace("/explore");
      return;
    }
    if (attemptedRecovery.current.has(wallet.status)) return;
    if (wallet.status === "wallet-missing") {
      attemptedRecovery.current.add(wallet.status);
      void wallet.createWallet();
    } else if (wallet.status === "wrong-chain") {
      attemptedRecovery.current.add(wallet.status);
      void wallet.switchToArc();
    }
  }, [flowStarted, router, wallet]);

  async function continueFlow() {
    if (wallet.status === "ready") {
      router.push("/explore");
      return;
    }

    setFlowStarted(true);
    attemptedRecovery.current.clear();
    if (wallet.status === "signed-out") {
      await wallet.createWallet();
    } else if (wallet.status === "wallet-missing") {
      await wallet.createWallet();
    } else if (wallet.status === "wrong-chain") {
      await wallet.switchToArc();
    }
  }

  const loading = wallet.status === "loading" || wallet.actionPending;
  const disabled = wallet.status === "unconfigured" || loading;
  const label = wallet.status === "ready"
    ? "Explore baskets"
    : wallet.status === "wallet-missing"
      ? wallet.actionPending ? "Creating wallet…" : "Create wallet"
      : wallet.status === "wrong-chain"
        ? wallet.actionPending ? "Switching to Arc…" : "Switch to Arc"
        : wallet.status === "loading"
          ? "Loading wallet…"
          : wallet.status === "unconfigured"
            ? "Wallet unavailable"
            : "Create passkey wallet";
  const Icon = loading ? LoaderCircle : wallet.status === "wallet-missing" ? Wallet : wallet.status === "wrong-chain" ? RefreshCw : ArrowRight;

  return (
    <div className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => void continueFlow()}
        disabled={disabled}
        aria-busy={loading}
        title={wallet.status === "unconfigured" ? wallet.error : undefined}
        className="focus-ring pressable inline-flex min-h-13 items-center justify-center gap-3 rounded-[var(--radius-control)] bg-primary px-6 text-base font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
      >
        {label}
        <Icon aria-hidden="true" size={18} className={loading ? "animate-spin" : ""} />
      </button>
      {wallet.error && wallet.status !== "unconfigured" ? (
        <p className="mt-3 max-w-sm text-xs font-semibold leading-5 text-destructive" role="alert">{wallet.error}</p>
      ) : null}
    </div>
  );
}
