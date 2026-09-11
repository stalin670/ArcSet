"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, Blocks, Database, RefreshCw, ShieldCheck, Waves } from "lucide-react";
import { FormattedNumber } from "@/components/formatted-number";
import type { ArcYieldIndexerSnapshot } from "@/lib/graph-yield";

type HealthResponse = {
  status: "ok";
  chainId: number;
  blockNumber: string;
  morpho: { vaultAddress: string; totalAssets: string };
  xylo: { vaultAddress: string; strategyActive: boolean };
};

type UniswapResponse = {
  status: "ready";
  chainId: number;
  poolAddress: string;
  fee: number;
  usdcBalance: string;
};

async function responseJson<T>(response: Response, label: string) {
  const payload = await response.json() as T | { error: string };
  if (!response.ok || "error" in (payload as object)) throw new Error(`${label} is unavailable.`);
  return payload as T;
}

async function loadData() {
  const [healthResponse, graphResponse, uniswapResponse] = await Promise.all([
    fetch("/api/health/arc", { cache: "no-store", headers: { Accept: "application/json" } }),
    fetch("/api/graph/vault-metrics", { cache: "no-store", headers: { Accept: "application/json" } }),
    fetch("/api/protocols/uniswap-base", { cache: "no-store", headers: { Accept: "application/json" } }),
  ]);
  const [health, graph, uniswap] = await Promise.all([
    responseJson<HealthResponse>(healthResponse, "Arc RPC"),
    responseJson<ArcYieldIndexerSnapshot>(graphResponse, "The Graph"),
    responseJson<UniswapResponse>(uniswapResponse, "Base Uniswap"),
  ]);
  return { health, graph, uniswap };
}

export function DataDashboard() {
  const query = useQuery({ queryKey: ["live-data-dashboard"], queryFn: loadData, retry: 1, staleTime: 10_000, refetchInterval: 30_000 });

  return (
    <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Live data</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.045em] md:text-6xl">Protocol health</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Onchain readiness across Arc, Base and The Graph.</p>
        </div>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} aria-busy={query.isFetching} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold disabled:cursor-wait disabled:opacity-60"><RefreshCw aria-hidden="true" size={16} className={query.isFetching ? "animate-spin" : ""} /> Refresh</button>
      </header>

      {query.isLoading ? <DashboardSkeleton /> : null}
      {query.isError ? <DashboardError retry={() => query.refetch()} /> : null}
      {query.data ? <DashboardContent {...query.data} /> : null}
    </section>
  );
}

function DashboardContent({ health, graph, uniswap }: Awaited<ReturnType<typeof loadData>>) {
  const indexedBlock = graph.indexedBlock;
  const lag = indexedBlock == null ? null : Math.max(0, Number(health.blockNumber) - indexedBlock);
  const eligibleVault = graph.vaults.find((vault) => vault.eligibility === "ELIGIBLE");
  const rejectedVault = graph.vaults.find((vault) => vault.eligibility === "REJECTED");
  const schema = graph.protocols[0]?.schemaVersion ?? null;

  return (
    <>
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Live infrastructure status">
        <StatusCard icon={Blocks} label="Arc Testnet" value="Online" tone="success" detail={<><FormattedNumber value={Number(health.blockNumber)} type="token_amount" context="detailed" tokenPriceUsd={1} />{" "}latest block</>} />
        <StatusCard icon={Database} label="The Graph" value={graph.configured && !graph.unavailable ? "Synced" : "Unavailable"} tone={graph.configured && !graph.unavailable ? "success" : "warning"} detail={<>Lag <FormattedNumber value={lag} type="token_amount" context="compact" tokenPriceUsd={1} /> blocks</>} />
        <StatusCard icon={ShieldCheck} label="Morpho" value={<FormattedNumber value={Number(health.morpho.totalAssets)} type="stable_value" context="compact" />} tone="success" detail="Vault assets on Arc" />
        <StatusCard icon={Waves} label="Uniswap V3" value="Ready" tone="success" detail={<><FormattedNumber value={Number(uniswap.usdcBalance)} type="token_amount" context="compact" tokenPriceUsd={1} />{" "}USDC in reviewed pool</>} />
      </section>

      <section className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-border bg-card" aria-labelledby="protocols-title">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-5 md:px-6">
          <div><h2 id="protocols-title" className="text-xl font-extrabold tracking-[-0.025em]">Protocol readiness</h2><p className="mt-1 text-xs text-muted-foreground">Only executable integrations enter baskets.</p></div>
          <span className="rounded-full bg-muted px-3 py-2 font-mono text-xs font-bold">3 reviewed</span>
        </div>
        <div className="divide-y divide-border">
          <ProtocolRow name="Morpho USDC Vault" network="Arc Testnet" status="Eligible" tone="success" metric={<><FormattedNumber value={Number(eligibleVault?.totalValueLockedUSD ?? health.morpho.totalAssets)} type="stable_value" context="detailed" />{" "}TVL</>} href={`https://testnet.arcscan.app/address/${health.morpho.vaultAddress}`} />
          <ProtocolRow name="Uniswap V3" network="Base Sepolia" status="Preview" tone="warning" metric={<>USDC/WETH · <FormattedNumber value={uniswap.fee / 10_000} type="percent" context="compact" /> fee</>} href={`https://sepolia.basescan.org/address/${uniswap.poolAddress}`} />
          <ProtocolRow name="XyloNet Vault" network="Arc Testnet" status="Rejected" tone="danger" metric={rejectedVault?.eligibilityReason ?? "No active strategy"} href={`https://testnet.arcscan.app/address/${health.xylo.vaultAddress}`} />
        </div>
      </section>

      <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-border bg-card p-5 md:px-6" aria-labelledby="index-title">
        <div><p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primary">Standardized index</p><h2 id="index-title" className="mt-1 text-lg font-extrabold">Messari Yield{schema ? ` v${schema}` : ""}</h2></div>
        <dl className="flex flex-wrap gap-6 text-sm">
          <div><dt className="text-xs text-muted-foreground">Indexed block</dt><dd><FormattedNumber value={indexedBlock} type="token_amount" context="detailed" tokenPriceUsd={1} className="mt-1 block font-bold" /></dd></div>
          <div><dt className="text-xs text-muted-foreground">Vaults</dt><dd><FormattedNumber value={graph.vaults.length} type="token_amount" context="compact" tokenPriceUsd={1} className="mt-1 block font-bold" /></dd></div>
        </dl>
        <a href="https://thegraph.com/studio/subgraph/arc-vaults" target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold">Open index <ArrowUpRight aria-hidden="true" size={15} /></a>
      </section>
    </>
  );
}

function StatusCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Blocks; label: string; value: React.ReactNode; detail: React.ReactNode; tone: "success" | "warning" }) {
  return <article className="rounded-[var(--radius-card)] border border-border bg-card p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground"><Icon aria-hidden="true" size={16} />{label}</div><div className={`mt-4 font-mono text-2xl font-extrabold tabular-nums ${tone === "success" ? "text-primary" : "text-warning"}`}>{value}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p></article>;
}

function ProtocolRow({ name, network, status, tone, metric, href }: { name: string; network: string; status: string; tone: "success" | "warning" | "danger"; metric: React.ReactNode; href: string }) {
  const toneClass = tone === "success" ? "text-primary" : tone === "warning" ? "text-warning" : "text-destructive";
  return <article className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)_auto] sm:items-center md:px-6"><div><h3 className="font-extrabold">{name}</h3><p className="mt-1 text-xs text-muted-foreground">{network}</p></div><span className={`text-sm font-bold ${toneClass}`}>{status}</span><p className="text-sm text-muted-foreground">{metric}</p><a href={href} target="_blank" rel="noreferrer" aria-label={`View ${name} contract`} className="focus-ring inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"><ArrowUpRight aria-hidden="true" size={16} /></a></article>;
}

function DashboardSkeleton() {
  return <div className="mt-8 space-y-6" aria-label="Loading protocol health" aria-busy="true"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-[var(--radius-card)] bg-muted" />)}</div><div className="h-72 animate-pulse rounded-[var(--radius-card)] bg-muted" /></div>;
}

function DashboardError({ retry }: { retry: () => unknown }) {
  return <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-destructive/20 bg-destructive/5 p-5"><div className="flex gap-3"><AlertCircle aria-hidden="true" className="mt-0.5 text-destructive" size={20} /><div><h2 className="font-extrabold">Live data unavailable</h2><p className="mt-1 text-sm text-muted-foreground">Retry the Arc, Base and Graph checks.</p></div></div><button type="button" onClick={retry} className="focus-ring min-h-10 rounded-[var(--radius-control)] bg-secondary px-3 text-sm font-bold">Retry</button></div>;
}
