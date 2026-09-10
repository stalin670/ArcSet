"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InvestmentPanel } from "@/components/investment-panel";
import { StatusPill } from "@/components/status-pill";
import { StrategyDetails } from "@/components/strategy-details";
import type { Basket } from "@/lib/baskets";

export function BasketDetail({ basket }: { basket: Basket }) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12">
      <Link href="/explore" className="focus-ring -ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" size={17} />
        All baskets
      </Link>

      <section className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-border bg-card">
        <div className="grid md:grid-cols-[minmax(18rem,0.8fr)_1.2fr]">
          <div className={`artwork artwork-${basket.artwork} min-h-64 border-b border-border md:min-h-96 md:border-b-0 md:border-r`} aria-hidden="true">
            <span className="absolute bottom-5 left-5 z-10 rounded-full bg-background/75 px-3 py-1 font-mono text-xs font-bold tracking-[0.1em] backdrop-blur-md">TESTNET</span>
          </div>
          <div className="flex flex-col justify-center p-6 md:p-10 lg:p-14">
            <StatusPill readiness={basket.readiness} label={basket.readinessLabel} />
            <h1 className="mt-5 text-4xl font-extrabold tracking-[-0.045em] md:text-6xl">{basket.name}</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">{basket.description}</p>
            <dl className="mt-7 flex flex-wrap gap-2 text-xs font-bold">
              <div className="rounded-full bg-muted px-3 py-2"><dt className="sr-only">Version</dt><dd>v{basket.version}</dd></div>
              <div className="rounded-full bg-muted px-3 py-2"><dt className="sr-only">Investment currency</dt><dd>{basket.inputAsset}</dd></div>
              <div className="rounded-full bg-muted px-3 py-2"><dt className="sr-only">Rebalancing</dt><dd>{basket.rebalanceMode === "manual" ? "Manual" : basket.rebalanceMode}</dd></div>
              <div className="rounded-full bg-muted px-3 py-2"><dt className="sr-only">Risk level</dt><dd className="capitalize">{basket.riskLevel} risk</dd></div>
              <div className="rounded-full bg-muted px-3 py-2"><dt className="sr-only">Time horizon</dt><dd>{basket.timeHorizon}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <Suspense fallback={<div className="h-[36rem] animate-pulse rounded-[var(--radius-card)] border border-border bg-card" aria-label="Loading strategy details" aria-busy="true" />}>
          <StrategyDetails basket={basket} />
        </Suspense>
        <div className="min-w-0 lg:sticky lg:top-28"><InvestmentPanel basket={basket} /></div>
      </div>
    </div>
  );
}
