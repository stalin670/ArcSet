"use client";

import { type KeyboardEvent, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, BookOpen, CalendarClock, ShieldCheck } from "lucide-react";
import { AllocationRing } from "@/components/allocation-ring";
import { FormattedNumber } from "@/components/formatted-number";
import { GraphVaultMetrics } from "@/components/graph-vault-metrics";
import type { Basket } from "@/lib/baskets";
import type { BasketMarketData, BasketMarketPoint } from "@/lib/market-data";

const strategyTabs = ["about", "historical", "rebalances", "risk", "resources"] as const;
type StrategyTab = (typeof strategyTabs)[number];

const tabLabel: Record<StrategyTab, string> = {
  about: "Overview",
  historical: "Performance",
  rebalances: "Changes",
  risk: "Risks",
  resources: "Links",
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function StrategyDetails({ basket }: { basket: Basket }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") as StrategyTab | null;
  const activeTab = strategyTabs.includes(requestedTab ?? "about") ? (requestedTab ?? "about") : "about";
  const hasHistoricalMarketData = basket.strategyType === "asset";
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const market = useQuery({
    queryKey: ["basket-market-data", basket.slug],
    queryFn: async () => {
      const response = await fetch(`/api/baskets/${basket.slug}/market-data`, { headers: { Accept: "application/json" } });
      const payload = await response.json() as BasketMarketData | { error: string };
      if (!response.ok || "error" in payload) throw new Error("Historical market data is temporarily unavailable.");
      return payload;
    },
    staleTime: 15 * 60_000,
    retry: 1,
    enabled: hasHistoricalMarketData,
  });

  function selectTab(tab: StrategyTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "about") params.delete("tab");
    else params.set("tab", tab);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % strategyTabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + strategyTabs.length) % strategyTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = strategyTabs.length - 1;
    else return;
    event.preventDefault();
    const tab = strategyTabs[next];
    selectTab(tab);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-card">
      <div className="overflow-x-auto border-b border-border px-3 md:px-5" role="tablist" aria-label="Strategy details">
        <div className="flex min-w-max gap-1">
          {strategyTabs.map((tab, index) => (
            <button
              ref={(element) => { tabRefs.current[index] = element; }}
              key={tab}
              type="button"
              role="tab"
              id={`strategy-tab-${tab}`}
              aria-controls={`strategy-panel-${tab}`}
              aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => selectTab(tab)}
              onKeyDown={(event) => moveTab(event, index)}
              className={`focus-ring min-h-12 border-b-2 px-3 text-sm font-bold transition-colors duration-100 ease-out ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {tabLabel[tab]}
            </button>
          ))}
        </div>
      </div>

      <div id={`strategy-panel-${activeTab}`} role="tabpanel" aria-labelledby={`strategy-tab-${activeTab}`} tabIndex={0} className="p-5 md:p-8">
        {activeTab === "about" ? <AboutTab basket={basket} market={market.data} loading={market.isLoading} error={market.isError} retry={() => market.refetch()} /> : null}
        {activeTab === "historical" ? hasHistoricalMarketData ? <HistoricalTab data={market.data} loading={market.isLoading} error={market.isError} retry={() => market.refetch()} /> : <ReferencePerformanceUnavailable /> : null}
        {activeTab === "rebalances" ? <RebalancesTab basket={basket} /> : null}
        {activeTab === "risk" ? <RiskTab basket={basket} /> : null}
        {activeTab === "resources" ? <ResourcesTab basket={basket} /> : null}
      </div>
    </section>
  );
}

function AboutTab({ basket, market, loading, error, retry }: { basket: Basket; market?: BasketMarketData; loading: boolean; error: boolean; retry: () => void }) {
  const usesEarn = basket.legs.some((leg) => leg.execution === "app-kit-earn");
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{usesEarn ? "Protocol status" : market ? `${market.periodDays}-day return` : "Strategy status"}</p>{usesEarn ? <span className="mt-1 block text-2xl font-extrabold">Verified live routes</span> : loading ? <div className="mt-2 h-9 w-28 animate-pulse rounded bg-muted" /> : market ? <FormattedNumber value={market.returnPercent} type="percent" sign="always" context="detailed" className={`mt-1 block text-3xl font-extrabold ${market.returnPercent >= 0 ? "text-primary" : "text-destructive"}`} /> : <span className="mt-1 block text-2xl font-extrabold">Live on Arc</span>}</div>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">{usesEarn ? "Vault discovery, APY, shares, fees, and every swap route are verified again before signing." : "Backtest using reference prices. Not a forecast."}</p>
      </div>

      <div className="mt-8 border-l-2 border-primary pl-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">The idea</h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-foreground">{basket.thesis}</p>
      </div>

      {usesEarn ? <GraphVaultMetrics /> : null}

      <h2 className="mt-8 text-xl font-extrabold tracking-[-0.025em]">Target allocation</h2>
      <div className="mt-8"><AllocationRing legs={basket.legs} /></div>

      <div className="mt-9 border-t border-border pt-8">
        <h2 className="text-xl font-extrabold tracking-[-0.025em]">Assets</h2>
        <div className="mt-5 space-y-3">
        {basket.legs.map((leg, index) => {
          const asset = market?.assets.find((item) => item.symbol === leg.symbol);
          return (
            <article key={`${leg.symbol}-${index}`} className="grid gap-4 rounded-xl bg-muted p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-strong font-mono text-xs font-extrabold">{leg.symbol.slice(0, 2)}</span>
                <div className="min-w-0"><h3 className="font-extrabold">{leg.symbol}</h3><p className="truncate text-sm text-muted-foreground">{leg.name}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{leg.address ? shortAddress(leg.address) : leg.execution === "app-kit-earn" ? "Verified with each quote" : "Quoted live"}</p></div>
              </div>
              {loading ? <div className="h-9 w-24 animate-pulse rounded bg-surface-strong" /> : asset ? (
                <div className="sm:text-right"><FormattedNumber value={asset.priceUsd} type="token_price" context="detailed" className="font-bold" /><FormattedNumber value={asset.change24hPercent} type="percent" context="compact" sign="always" className={`mt-1 block text-xs font-bold ${(asset.change24hPercent ?? 0) >= 0 ? "text-primary" : "text-destructive"}`} /><span className="sr-only">24-hour change</span></div>
              ) : <span className="font-mono text-muted-foreground">--</span>}
              <div className="sm:min-w-24 sm:text-right"><span className="block text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">Allocation</span><FormattedNumber value={leg.weight} type="percent" context="compact" className="mt-1 block font-bold" /></div>
            </article>
          );
        })}
        </div>
      </div>

      {hasHistoricalMarketData(basket) && error ? <MarketDataError retry={retry} /> : null}
    </div>
  );
}

function ReferencePerformanceUnavailable() {
  return (
    <div className="rounded-xl bg-muted p-5">
      <h2 className="text-lg font-extrabold">Performance starts with your investment</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">This strategy combines live protocol positions. ArcSet tracks your actual entry amounts and current holdings instead of manufacturing a synthetic protocol return.</p>
    </div>
  );
}

function HistoricalTab({ data, loading, error, retry }: { data?: BasketMarketData; loading: boolean; error: boolean; retry: () => void }) {
  if (loading) return <div className="h-72 animate-pulse rounded-xl bg-muted" aria-label="Loading historical performance" aria-busy="true" />;
  if (error || !data) return <MarketDataError retry={retry} />;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">Index value</p><FormattedNumber value={data.currentValue} type="token_amount" context="detailed" className="mt-1 block text-3xl font-extrabold" /></div><div className="text-right"><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{data.periodDays}-day return</p><FormattedNumber value={data.returnPercent} type="percent" context="detailed" sign="always" className={`mt-1 block text-xl font-bold ${data.returnPercent >= 0 ? "text-primary" : "text-destructive"}`} /></div></div>
      <div className="mt-6 rounded-xl bg-muted p-4"><PerformanceChart series={data.series} /></div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Backtest starts at 100 using current target weights and <a href="https://www.coingecko.com/en/api" target="_blank" rel="noreferrer" className="font-bold text-foreground underline decoration-border underline-offset-4 hover:decoration-current">CoinGecko reference prices</a>.</p>
    </div>
  );
}

function PerformanceChart({ series }: { series: BasketMarketPoint[] }) {
  const chart = useMemo(() => {
    const width = 720;
    const height = 240;
    const padding = 16;
    const values = series.map((point) => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = Math.max(maximum - minimum, 0.0001);
    const points = series.map((point, index) => {
      const x = padding + (index / Math.max(series.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point.value - minimum) / range) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    return { width, height, points, minimum, maximum };
  }, [series]);

  return (
    <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-60 w-full" role="img" aria-label={`Historical basket index from ${chart.minimum.toFixed(2)} to ${chart.maximum.toFixed(2)}`}>
      {[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1="16" x2={chart.width - 16} y1={chart.height * fraction} y2={chart.height * fraction} className="stroke-border" strokeWidth="1" />)}
      <polyline points={chart.points} fill="none" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function RebalancesTab({ basket }: { basket: Basket }) {
  return (
    <div><div className="flex gap-3"><CalendarClock className="mt-0.5 text-primary" aria-hidden="true" size={20} /><div><h2 className="text-lg font-extrabold">Version {basket.version} · Current</h2><p className="mt-1 text-sm text-muted-foreground">No allocation changes yet.</p></div></div><dl className="mt-6 divide-y divide-border rounded-xl bg-muted px-4">{basket.legs.map((leg) => <div key={leg.symbol} className="flex items-center justify-between py-3"><dt className="text-sm font-bold">{leg.symbol}</dt><dd><FormattedNumber value={leg.weight} type="percent" context="compact" className="font-bold" /></dd></div>)}</dl></div>
  );
}

function RiskTab({ basket }: { basket: Basket }) {
  return <div><h2 className="text-xl font-extrabold">Risk notes</h2><ul className="mt-5 space-y-4">{basket.riskNotes.map((note) => <li key={note} className="flex gap-3 text-sm leading-6 text-muted-foreground"><ShieldCheck className="mt-0.5 shrink-0 text-warning" aria-hidden="true" size={17} />{note}</li>)}</ul></div>;
}

function ResourcesTab({ basket }: { basket: Basket }) {
  const links = [
    { label: "Arc contract addresses", href: "https://docs.arc.io/arc/references/contract-addresses" },
    { label: "App Kit swap documentation", href: "https://docs.arc.io/app-kit/swap" },
    { label: "CoinGecko market data", href: "https://www.coingecko.com/en/api" },
    ...(basket.legs.some((leg) => leg.execution === "app-kit-earn") ? [{ label: "App Kit Earn documentation", href: "https://docs.arc.io/app-kit" }] : []),
    ...basket.legs.flatMap((leg) => leg.resourceUrl && leg.protocol ? [{ label: `${leg.protocol} documentation`, href: leg.resourceUrl }] : []),
  ];
  const uniqueLinks = [...new Map(links.map((link) => [link.href, link])).values()];
  return <div><div className="flex gap-3"><BookOpen className="mt-0.5 text-primary" aria-hidden="true" size={20} /><div><h2 className="text-lg font-extrabold">Documentation</h2><p className="mt-1 text-sm text-muted-foreground">Sources for this basket.</p></div></div><div className="mt-6 grid gap-2">{uniqueLinks.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="focus-ring flex min-h-12 items-center justify-between rounded-xl bg-muted px-4 text-sm font-bold transition-colors duration-100 ease-out hover:bg-surface-strong">{link.label}<ArrowUpRight aria-hidden="true" size={16} /></a>)}</div></div>;
}

function hasHistoricalMarketData(basket: Basket) {
  return basket.strategyType === "asset";
}

function MarketDataError({ retry }: { retry: () => void }) {
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4"><div className="flex gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 shrink-0" aria-hidden="true" size={17} /><span>Historical market data is temporarily unavailable.</span></div><button type="button" onClick={retry} className="focus-ring min-h-10 rounded-lg bg-secondary px-3 text-sm font-bold">Retry</button></div>;
}
