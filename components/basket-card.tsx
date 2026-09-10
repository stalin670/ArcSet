import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { FormattedNumber } from "@/components/formatted-number";
import { StatusPill } from "@/components/status-pill";
import type { Basket } from "@/lib/baskets";
import { basketProtocols } from "@/lib/protocol-adapters";

export function BasketCard({ basket }: { basket: Basket }) {
  const protocols = basketProtocols(basket).filter((protocol) => protocol !== "Arc");

  return (
    <Link
      href={`/basket/${basket.slug}`}
      className="focus-ring lift-card group block overflow-hidden rounded-[var(--radius-card)] border border-border bg-card"
      aria-label={`View ${basket.name} basket`}
    >
      <article>
        <div className={`artwork artwork-${basket.artwork} aspect-[16/7] border-b border-border`} aria-hidden="true">
          <span className="card-arrow absolute bottom-5 right-5 z-10 grid size-11 place-items-center rounded-full bg-background/80 text-foreground backdrop-blur-md">
            <ArrowUpRight aria-hidden="true" size={18} />
          </span>
        </div>
        <div className="flex min-h-56 flex-col p-5 md:p-6">
          <div className="mb-4">
            <StatusPill readiness={basket.readiness} label={basket.strategyType === "cross-chain" ? "Arc + Base preview" : "Live on Arc"} />
          </div>
          <h2 className="text-xl font-extrabold tracking-[-0.025em] text-card-foreground md:text-2xl">{basket.name}</h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{basket.description}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted px-3 py-2"><dt className="text-muted-foreground">Risk</dt><dd className="mt-1 font-bold capitalize">{basket.riskLevel}</dd></div>
            <div className="rounded-lg bg-muted px-3 py-2"><dt className="text-muted-foreground">Protocols</dt><dd className="mt-1 truncate font-bold" title={protocols.join(", ")}>{protocols.join(" + ") || "Wallet"}</dd></div>
          </dl>
          <div className="mt-auto flex items-end justify-between gap-4 pt-6">
            <div className="flex flex-wrap gap-1.5" aria-label={`${basket.legs.length} assets`}>
              {basket.legs.slice(0, 3).map((leg, index) => (
                <span key={`${leg.symbol}-${index}`} className="inline-flex min-h-7 items-center rounded-lg bg-surface-strong px-2 font-mono text-[0.66rem] font-extrabold text-card-foreground">
                  {leg.symbol}
                </span>
              ))}
            </div>
            <div className="text-right">
              <span className="block text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">{basket.metricLabel}</span>
              <FormattedNumber value={basket.metricValue} type={basket.metricType} context="compact" tokenPriceUsd={basket.metricType === "token_amount" ? 1 : undefined} className="mt-1 block text-base font-bold text-primary" />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
