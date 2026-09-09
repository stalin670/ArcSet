"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FormattedNumber } from "@/components/formatted-number";

export type LandingPreviewBasket = {
  name: string;
  eyebrow: string;
  status: string;
  artwork: string;
  metricLabel: string;
  metricValue: number;
  metricType: "percent" | "token_amount";
  legs: Array<{ symbol: string; weight: number }>;
};

/* ─────────────────────────────────────────────────────────
 * LANDING PRODUCT PREVIEW STORYBOARD
 *
 * The headline and Get started action are visible immediately.
 * Only the supporting product preview receives an entrance.
 *
 *    0ms   primary action is already usable
 *    0ms   featured basket is visible with the primary action
 *  180ms   first supporting strategy appears
 *  260ms   second supporting strategy appears
 *  520ms   full preview is settled
 * ───────────────────────────────────────────────────────── */
const TIMING = { secondary: 180, tertiary: 260 } as const;
const SUPPORTING_SPRING = { type: "spring" as const, stiffness: 350, damping: 31 };

export function LandingStrategyShowcase({ baskets }: { baskets: LandingPreviewBasket[] }) {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState(0);
  const visibleStage = reduceMotion ? 3 : stage;
  const featured = baskets[0];
  const supporting = baskets.slice(1, 3);

  useEffect(() => {
    if (reduceMotion) return;
    const timers = [
      window.setTimeout(() => setStage(2), TIMING.secondary),
      window.setTimeout(() => setStage(3), TIMING.tertiary),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [reduceMotion]);

  if (!featured) return null;
  const primaryWeight = featured.legs[0]?.weight ?? 0;

  return (
    <div className="relative pb-4 lg:py-8">
      <div className="pointer-events-none absolute -inset-8 rounded-full bg-primary/5 blur-3xl" aria-hidden="true" />
      <article className="relative z-20 overflow-hidden rounded-[var(--radius-card)] border border-border bg-card">
        <div className={`artwork artwork-${featured.artwork} min-h-52 sm:min-h-60`}>
          <span className="absolute left-5 top-5 z-10 rounded-full bg-background/75 px-3 py-1 font-mono text-[0.68rem] font-bold tracking-[0.1em] text-foreground backdrop-blur-md">
            {featured.status}
          </span>
          <div className="absolute inset-x-5 bottom-5 z-10 rounded-xl bg-background/80 p-4 backdrop-blur-md">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-primary">{featured.eyebrow}</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.035em]">{featured.name}</h2>
          </div>
        </div>
        <div className="p-5 md:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-extrabold">Target allocation</h3>
            <span className="font-mono text-xs font-bold text-muted-foreground">{featured.legs.length} ASSETS</span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${featured.legs[0]?.symbol ?? "Primary asset"} ${primaryWeight}%`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${primaryWeight}%` }} />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3">
            {featured.legs.slice(0, 2).map((leg) => (
              <div key={leg.symbol} className="rounded-xl bg-muted p-4">
                <dt className="font-mono text-xs font-bold text-muted-foreground">{leg.symbol}</dt>
                <dd className="mt-2 text-xl font-extrabold">
                  <FormattedNumber value={leg.weight} type="percent" context="compact" />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </article>

      <div className="relative z-10 -mt-1 grid gap-3 px-3 sm:grid-cols-2 sm:px-5">
        {supporting.map((basket, index) => {
          const requiredStage = index + 2;
          return (
            <motion.article
              key={basket.name}
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: visibleStage >= requiredStage ? 1 : 0, y: visibleStage >= requiredStage ? 0 : 16 }}
              transition={SUPPORTING_SPRING}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className={`artwork artwork-${basket.artwork} min-h-24 border-b border-border`} aria-hidden="true" />
              <div className="p-4">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">{basket.eyebrow}</p>
                <h3 className="mt-1 truncate text-sm font-extrabold" title={basket.name}>{basket.name}</h3>
                <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-3">
                  <span className="text-xs font-semibold text-muted-foreground">{basket.metricLabel}</span>
                  <FormattedNumber value={basket.metricValue} type={basket.metricType} context="compact" tokenPriceUsd={basket.metricType === "token_amount" ? 1 : undefined} className="text-sm font-extrabold text-primary" />
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}
