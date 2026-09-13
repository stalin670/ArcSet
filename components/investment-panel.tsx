"use client";

import { CompositeInvestmentPanel } from "@/components/composite-investment-panel";
import { CrossChainInvestmentPanel } from "@/components/cross-chain-investment-panel";
import { CrossChainPositionManager } from "@/components/cross-chain-position-manager";
import { EarnInvestmentPanel } from "@/components/earn-investment-panel";
import type { Basket } from "@/lib/baskets";

export function InvestmentPanel({ basket }: { basket: Basket }) {
  if (basket.strategyType === "cross-chain") return <div className="space-y-4"><CrossChainInvestmentPanel basket={basket} /><CrossChainPositionManager /></div>;
  if (basket.strategyType === "earn") return <EarnInvestmentPanel basket={basket} />;
  if (basket.executionAvailability !== "live") return <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Execution is not available for this basket.</p>;
  return <CompositeInvestmentPanel basket={basket} />;
}
