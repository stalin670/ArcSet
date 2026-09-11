"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Blocks, Database, RefreshCw } from "lucide-react";
import { FormattedNumber } from "@/components/formatted-number";

type StandardizedVault = {
  id: string;
  name?: string | null;
  totalValueLockedUSD: string;
  pricePerShare?: string | null;
  inputTokenBalance: string;
  eligibility: "ELIGIBLE" | "EXPERIMENTAL" | "REJECTED";
  protocol: { id: string; name: string };
  inputToken: { symbol: string; decimals: number };
};

type StandardizedProtocol = {
  id: string;
  name: string;
  schemaVersion: string;
  methodologyVersion: string;
  cumulativeUniqueUsers: number;
};

type IndexerResponse = {
  configured: boolean;
  source: "the-graph" | "not-configured";
  indexedBlock: number | null;
  indexedTimestamp: number | null;
  hasIndexingErrors: boolean;
  unavailable?: boolean;
  errorMessage?: string;
  protocols: StandardizedProtocol[];
  vaults: StandardizedVault[];
};

export function GraphVaultMetrics() {
  const query = useQuery({
    queryKey: ["arc-yield-indexer"],
    queryFn: async () => {
      const response = await fetch("/api/graph/vault-metrics", { cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json() as IndexerResponse | { error: string };
      if (!response.ok || "error" in payload) throw new Error("The Graph indexer could not be reached.");
      return payload;
    },
    retry: 1,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  if (query.isLoading) {
    return <div className="mt-8 h-32 animate-pulse rounded-xl bg-muted" aria-label="Loading standardized vault metrics" aria-busy="true" />;
  }

  if (query.isError) {
    return (
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <div className="flex gap-3"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-destructive" size={18} /><div><p className="text-sm font-extrabold">Indexer temporarily unavailable</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Protocol execution remains available. Retry the independent data layer.</p></div></div>
        <button type="button" onClick={() => void query.refetch()} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] bg-secondary px-3 text-sm font-bold"><RefreshCw aria-hidden="true" size={15} /> Retry</button>
      </div>
    );
  }

  if (!query.data?.configured) {
    return (
      <div className="mt-8 rounded-xl border border-border bg-muted p-4">
        <div className="flex gap-3"><Database aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" size={18} /><div><p className="text-sm font-extrabold">Standardized indexer ready to deploy</p><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">The application contains the Arc Testnet Messari-compatible yield subgraph, but no hosted endpoint is configured. No mock metrics are shown.</p></div></div>
      </div>
    );
  }

  if (query.data.unavailable) {
    return <div className="mt-8 rounded-xl border border-warning/20 bg-warning/5 p-4"><div className="flex gap-3"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-warning" size={18} /><div><p className="text-sm font-extrabold">Live indexer unavailable</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{query.data.errorMessage} Protocol execution continues independently.</p></div></div></div>;
  }

  const vault = query.data.vaults.find((candidate) => candidate.eligibility === "ELIGIBLE");
  const protocol = query.data.protocols.find((candidate) => candidate.id === vault?.protocol.id);
  if (!vault || !protocol) {
    return <div className="mt-8 rounded-xl bg-muted p-4"><p className="text-sm font-extrabold">Indexer is catching up</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The live endpoint is connected but has not produced standardized vault entities yet.</p></div>;
  }

  return (
    <section className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-4" aria-labelledby="graph-metrics-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"><Database aria-hidden="true" size={16} /></span><div><h2 id="graph-metrics-title" className="text-sm font-extrabold">Indexed live by The Graph</h2><p className="mt-1 text-xs text-muted-foreground">Messari Yield schema v{protocol.schemaVersion} · methodology v{protocol.methodologyVersion}</p></div></div>
        <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-background px-3 font-mono text-xs font-bold"><Blocks aria-hidden="true" size={14} /> Block <FormattedNumber value={query.data.indexedBlock} type="token_amount" context="detailed" tokenPriceUsd={1} /></span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-background p-3"><dt className="text-xs font-bold text-muted-foreground">Vault TVL</dt><dd><FormattedNumber value={Number(vault.totalValueLockedUSD)} type="stable_value" context="detailed" className="mt-1 block font-bold" /></dd></div>
        <div className="rounded-lg bg-background p-3"><dt className="text-xs font-bold text-muted-foreground">Price per share</dt><dd><FormattedNumber value={vault.pricePerShare == null ? null : Number(vault.pricePerShare)} type="token_price" context="detailed" className="mt-1 block font-bold" /></dd></div>
        <div className="rounded-lg bg-background p-3"><dt className="text-xs font-bold text-muted-foreground">Observed users</dt><dd><FormattedNumber value={protocol.cumulativeUniqueUsers} type="token_amount" context="detailed" tokenPriceUsd={1} className="mt-1 block font-bold" /></dd></div>
      </dl>
      {query.data.hasIndexingErrors ? <p className="mt-3 text-xs font-semibold text-warning">The provider reports indexing errors. Treat these metrics as incomplete.</p> : null}
    </section>
  );
}
