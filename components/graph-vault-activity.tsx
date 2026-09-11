"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, RefreshCw } from "lucide-react";
import { FormattedNumber } from "@/components/formatted-number";
import { ARC_EXPLORER_URL } from "@/lib/arc";
import type { ArcYieldIndexerSnapshot, StandardizedVaultActivity } from "@/lib/graph-yield";

type TimelineEvent = StandardizedVaultActivity & { operation: "deposit" | "withdraw" };

function activityDate(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(Number(timestamp) * 1_000);
}

export function GraphVaultActivity({ address }: { address: string }) {
  const query = useQuery({
    queryKey: ["graph-vault-activity", address.toLowerCase()],
    queryFn: async () => {
      const response = await fetch(`/api/graph/vault-metrics?account=${encodeURIComponent(address)}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json() as ArcYieldIndexerSnapshot | { error: string };
      if (!response.ok || "error" in payload) throw new Error("Couldn’t load indexed vault activity.");
      return payload;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  const events = useMemo<TimelineEvent[]>(() => {
    if (!query.data) return [];
    return [
      ...query.data.activity.deposits.map((event) => ({ ...event, operation: "deposit" as const })),
      ...query.data.activity.withdraws.map((event) => ({ ...event, operation: "withdraw" as const })),
    ].sort((left, right) => Number(right.timestamp) - Number(left.timestamp));
  }, [query.data]);

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-card" aria-labelledby="indexed-activity-title">
      <div className="flex items-center justify-between border-b border-border p-5 md:px-6">
        <div className="flex flex-wrap items-center gap-3"><h2 id="indexed-activity-title" className="text-xl font-extrabold tracking-[-0.025em]">Recent activity</h2><span className="rounded-full bg-muted px-2 py-1 font-mono text-[11px] font-bold text-muted-foreground">The Graph</span></div>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} aria-busy={query.isFetching} aria-label="Refresh indexed activity" className="focus-ring grid size-10 place-items-center rounded-lg bg-secondary disabled:cursor-wait disabled:opacity-60"><RefreshCw aria-hidden="true" size={15} className={query.isFetching ? "animate-spin" : ""} /></button>
      </div>

      {query.isLoading ? <div className="space-y-1 p-5" aria-label="Loading indexed vault activity" aria-busy="true">{Array.from({ length: 2 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div> : null}
      {query.isError || query.data?.unavailable ? <ActivityState title="Indexed activity unavailable" detail="Balances and positions are unaffected." /> : null}
      {query.data && !query.data.configured ? <ActivityState title="Indexer not configured" detail="Add the deployed Graph endpoint to recover history." /> : null}
      {query.data?.configured && !query.data.unavailable && !events.length ? <ActivityState title="No indexed activity yet" detail={<>Indexed through block <FormattedNumber value={query.data.indexedBlock} type="token_amount" context="detailed" tokenPriceUsd={1} />.</>} /> : null}
      {events.length ? <ol className="divide-y divide-border px-5 md:px-6">{events.slice(0, 5).map((event) => <ActivityRow key={`${event.operation}-${event.id}`} event={event} />)}</ol> : null}
    </section>
  );
}

function ActivityRow({ event }: { event: TimelineEvent }) {
  const deposit = event.operation === "deposit";
  const Icon = deposit ? ArrowDownToLine : ArrowUpFromLine;
  return <li className="grid gap-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><span className={`grid size-9 place-items-center rounded-full bg-muted ${deposit ? "text-primary" : "text-warning"}`}><Icon aria-hidden="true" size={16} /></span><div className="min-w-0"><p className="text-sm font-extrabold">{deposit ? "Deposit" : "Withdrawal"} · {event.vault.protocol.name}</p><p className="mt-1 text-xs text-muted-foreground">{activityDate(event.timestamp)}</p></div><div className="flex items-center justify-between gap-2 sm:justify-end"><FormattedNumber value={Number(event.amountUSD)} type="stable_value" context="detailed" sign={deposit ? "never" : "always"} className="font-bold" /><a href={`${ARC_EXPLORER_URL}/tx/${event.hash}`} target="_blank" rel="noreferrer" aria-label={`View ${event.operation} transaction on ArcScan`} className="focus-ring grid size-9 place-items-center rounded-lg text-muted-foreground hover:text-foreground"><ArrowUpRight aria-hidden="true" size={16} /></a></div></li>;
}

function ActivityState({ title, detail }: { title: string; detail: React.ReactNode }) {
  return <div className="p-5 md:px-6"><p className="text-sm font-extrabold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}
