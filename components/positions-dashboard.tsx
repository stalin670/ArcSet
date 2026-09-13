"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, RefreshCw, WalletCards } from "lucide-react";
import { useArcWallet } from "@/components/arc-wallet-context";
import { BasketExitPanel } from "@/components/basket-exit-panel";
import { FormattedNumber } from "@/components/formatted-number";
import { GraphVaultActivity } from "@/components/graph-vault-activity";
import { ARC_EXPLORER_URL } from "@/lib/arc";
import { getArcEarnPosition, type ArcEarnPosition } from "@/lib/arc-earn-client";
import { calculateBasketDrift, type BasketDrift } from "@/lib/basket-drift";
import { getBasket } from "@/lib/baskets";
import type { ArcAssetPrices } from "@/lib/asset-prices-server";
import {
  aggregateBasketPositions,
  POSITION_UPDATED_EVENT,
  positionsForWallet,
  readStoredPositions,
  reconcilePositionReceipts,
  type StoredBasketPosition,
  type AggregatedBasketPosition,
  type TransactionResolution,
} from "@/lib/positions";
import {
  CROSS_CHAIN_POSITION_UPDATED_EVENT,
  crossChainPositionsForWallet,
  readCrossChainPositions,
  removeCrossChainPosition,
  type CrossChainBasketPosition,
} from "@/lib/cross-chain-positions";
import { subscribePositionChanges } from "@/lib/position-store";

type WalletAsset = { symbol: "USDC" | "EURC" | "cirBTC"; balance: string; rawBalance: string; decimals: 6 | 8 };
type WalletAssetsResponse = { address: string; chainId: number; asOf: number; assets: WalletAsset[] };

function assetBalance(data: WalletAssetsResponse | undefined, symbol: WalletAsset["symbol"]) {
  const value = data?.assets.find((asset) => asset.symbol === symbol)?.balance;
  return value == null ? null : Number(value);
}

function positionDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

export function PositionsDashboard() {
  const wallet = useArcWallet();
  const [storedPositions, setStoredPositions] = useState<StoredBasketPosition[]>([]);
  const [crossChainPositions, setCrossChainPositions] = useState<CrossChainBasketPosition[]>([]);
  const [activeExits, setActiveExits] = useState<Record<string, AggregatedBasketPosition>>({});
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    function refreshStoredPositions() {
      const errors: string[] = [];
      try {
        setStoredPositions(readStoredPositions());
      } catch {
        errors.push("Arc position metadata could not be read.");
      }
      try {
        setCrossChainPositions(wallet.address ? crossChainPositionsForWallet(readCrossChainPositions(), wallet.address) : []);
      } catch {
        errors.push("Cross-chain position metadata could not be read.");
      }
      setStorageError(errors.join(" "));
      setStorageLoading(false);
    }
    refreshStoredPositions();
    return subscribePositionChanges([POSITION_UPDATED_EVENT, CROSS_CHAIN_POSITION_UPDATED_EVENT], refreshStoredPositions);
  }, [wallet.address]);

  const holdings = useQuery({
    queryKey: ["arc-position-assets", wallet.address],
    enabled: wallet.status === "ready" && Boolean(wallet.address),
    queryFn: async () => {
      const response = await fetch(`/api/wallets/${wallet.address}/positions`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json() as WalletAssetsResponse | { error: string };
      if (!response.ok || "error" in payload) throw new Error("Couldn’t load your Arc holdings.");
      return payload;
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2_000),
    refetchInterval: 15_000,
  });
  const earnPosition = useQuery({
    queryKey: ["arc-earn-position", wallet.address],
    enabled: wallet.status === "ready" && Boolean(wallet.address),
    queryFn: async () => {
      if (!wallet.address) throw new Error("Circle wallet address is unavailable.");
      return getArcEarnPosition(wallet.address);
    },
    retry: 1,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const prices = useQuery({
    queryKey: ["arc-asset-prices"],
    enabled: wallet.status === "ready",
    queryFn: async () => {
      const response = await fetch("/api/asset-prices", { headers: { Accept: "application/json" } });
      const payload = await response.json() as ArcAssetPrices | { error: string };
      if (!response.ok || "error" in payload) throw new Error("Couldn’t load current asset prices.");
      return payload;
    },
    retry: 1,
    staleTime: 5 * 60_000,
  });

  const recorded = useMemo(() => {
    if (!wallet.address) return [];
    return aggregateBasketPositions(positionsForWallet(storedPositions, wallet.address));
  }, [storedPositions, wallet.address]);
  // Keep the receipt panel mounted after a full exit removes the holding.
  const displayedPositions = [...recorded];
  for (const [key, snapshot] of Object.entries(activeExits)) {
    if (key === `${wallet.address}:${snapshot.basketSlug}` && !recorded.some((position) => position.basketSlug === snapshot.basketSlug)) {
      displayedPositions.push({ ...snapshot, investedUsdc: "0", retainedUsdc: "0", outputs: [] });
    }
  }
  const visibleCrossChainPositions = wallet.address ? crossChainPositionsForWallet(crossChainPositions, wallet.address) : [];
  const pendingHashes = useMemo(() => storedPositions
    .filter((position) => !wallet.address || position.walletAddress.toLowerCase() === wallet.address.toLowerCase())
    .flatMap((position) => position.legs.filter((leg) => leg.status === "pending").map((leg) => leg.transactionHash.toLowerCase())), [storedPositions, wallet.address]);
  const reconciliation = useQuery({
    queryKey: ["arc-execution-reconciliation", ...pendingHashes],
    enabled: pendingHashes.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(pendingHashes.map(async (hash) => {
        const response = await fetch(`/api/executions/${hash}`, { cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) return null;
        const payload = await response.json() as { status: TransactionResolution };
        return [hash, payload.status] as const;
      }));
      return Object.fromEntries(entries.filter((entry): entry is readonly [string, TransactionResolution] => entry !== null));
    },
    refetchInterval: 2_500,
    retry: 1,
  });

  useEffect(() => {
    function reconcile() {
      if (!reconciliation.data || !Object.keys(reconciliation.data).length) return;
      try {
        reconcilePositionReceipts(reconciliation.data);
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : "Receipt updates could not be saved.");
      }
    }
    reconcile();
    return subscribePositionChanges([POSITION_UPDATED_EVENT], reconcile);
  }, [reconciliation.data]);
  const usdcBalance = assetBalance(holdings.data, "USDC");
  const eurcBalance = assetBalance(holdings.data, "EURC");
  const cirbtcBalance = assetBalance(holdings.data, "cirBTC");
  const earnBalance = Number(earnPosition.data?.currentBalance ?? 0);
  const hasEarnPosition = earnBalance > 0;
  const hasUnattributedAssets = recorded.length === 0 && ((eurcBalance ?? 0) > 0 || (cirbtcBalance ?? 0) > 0);
  const recordedEarnPrincipal = recorded.reduce((total, position) => total + Number(position.outputs.find((output) => output.token === "EARN-USDC")?.amount ?? 0), 0);
  const earnValueMultiplier = recordedEarnPrincipal > 0 && earnBalance > 0 ? earnBalance / recordedEarnPrincipal : 1;

  if (wallet.status !== "ready") {
    return <WalletGate status={wallet.status} pending={wallet.actionPending} login={wallet.login} createWallet={wallet.createWallet} switchToArc={wallet.switchToArc} />;
  }

  if ((holdings.isLoading || storageLoading) && !holdings.data) return <PositionsSkeleton />;

  return (
    <div className="space-y-6">
      {holdings.isError ? (
        <StateMessage
          icon={AlertCircle}
          title="Couldn’t load current holdings"
          description="Your saved transactions are still available. Retry the Arc balance request."
          actionLabel="Retry"
          onAction={() => holdings.refetch()}
          destructive
        />
      ) : null}

      {earnPosition.isError ? (
        <StateMessage
          icon={AlertCircle}
          title="Couldn’t load the Earn position"
          description="Wallet balances are still available. Retry the live EarnKit and Arc position read."
          actionLabel="Retry"
          onAction={() => earnPosition.refetch()}
          destructive
        />
      ) : null}

      {prices.isError ? (
        <StateMessage icon={AlertCircle} title="Couldn’t value basket drift" description="Balances remain available. Retry current market prices to restore allocation monitoring." actionLabel="Retry prices" onAction={() => prices.refetch()} />
      ) : null}

      {storageError ? (
        <StateMessage
          icon={AlertCircle}
          title="Saved position metadata needs attention"
          description={storageError}
          actionLabel="Retry reading records"
          onAction={() => window.dispatchEvent(new Event(POSITION_UPDATED_EVENT))}
          destructive
        />
      ) : null}

      {pendingHashes.length ? <div className="flex items-center gap-2 rounded-xl border border-warning/20 bg-warning/5 px-4 py-3 text-xs font-semibold text-muted-foreground"><RefreshCw aria-hidden="true" size={15} className={reconciliation.isFetching ? "animate-spin text-warning" : "text-warning"} /> Checking {pendingHashes.length} submitted Arc {pendingHashes.length === 1 ? "transaction" : "transactions"} against the chain.</div> : null}

      <section aria-labelledby="arc-assets-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="arc-assets-title" className="text-xl font-extrabold tracking-[-0.025em]">Wallet</h2>
          <button type="button" onClick={() => { void holdings.refetch(); void earnPosition.refetch(); }} disabled={holdings.isFetching || earnPosition.isFetching} aria-busy={holdings.isFetching || earnPosition.isFetching} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-secondary px-4 text-sm font-bold text-secondary-foreground disabled:cursor-wait disabled:opacity-60">
            <RefreshCw aria-hidden="true" size={16} className={holdings.isFetching || earnPosition.isFetching ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AssetCard symbol="USDC" value={usdcBalance} />
          <AssetCard symbol="EURC" value={eurcBalance} />
          <AssetCard symbol="cirBTC" value={cirbtcBalance} tokenPriceUsd={null} />
          <AssetCard symbol="Earn USDC" value={earnPosition.isLoading ? null : earnBalance} />
        </div>
      </section>

      <section aria-labelledby="basket-positions-title" className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-5 md:px-6">
          <h2 id="basket-positions-title" className="text-xl font-extrabold tracking-[-0.025em]">Baskets</h2>
          <span className="rounded-full bg-muted px-3 py-2 font-mono text-xs font-bold">{recorded.length + visibleCrossChainPositions.length + (hasEarnPosition && recordedEarnPrincipal === 0 ? 1 : 0)} positions</span>
        </div>

        {displayedPositions.length || hasEarnPosition || visibleCrossChainPositions.length ? (
          <div className="divide-y divide-border">
            {hasEarnPosition && recordedEarnPrincipal === 0 && earnPosition.data ? <EarnPositionCard position={earnPosition.data} /> : null}
            {visibleCrossChainPositions.map((position) => <CrossChainPositionCard key={position.id} position={position} onRemove={() => {
              try { removeCrossChainPosition(position.id); } catch (error) { setStorageError(error instanceof Error ? error.message : "Could not remove saved position."); }
            }} />)}
            {displayedPositions.map((position) => {
              const basket = getBasket(position.basketSlug);
              if (!basket) return null;
              const drift = prices.data ? calculateBasketDrift(basket, position, { USDC: prices.data.USDC, EURC: prices.data.EURC, cirBTC: prices.data.cirBTC, "EARN-USDC": earnValueMultiplier }) : null;
              return (
                <article key={`${wallet.address}:${position.basketSlug}`} className="p-5 md:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-extrabold">{basket.name}</h3><StatusBadge status={position.status} /></div><p className="mt-1 text-xs text-muted-foreground">Updated {positionDate(position.latestCreatedAt)}</p></div>
                    <div className="text-right"><span className="block text-xs font-bold text-muted-foreground">Current value</span><FormattedNumber value={drift?.currentValue ?? Number(position.investedUsdc)} type="stable_value" context="detailed" className="mt-1 block text-xl font-extrabold" /></div>
                  </div>
                  <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                    <PositionMetric label="Reserve" value={Number(position.retainedUsdc)} token="USDC" />
                    {position.outputs.map((output) => <PositionMetric key={output.token} label={output.token === "EARN-USDC" ? "Morpho" : output.token} value={Number(output.amount)} token={output.token} tokenPriceUsd={output.token === "cirBTC" ? null : 1} />)}
                  </dl>
                  <BasketDriftReview drift={drift} loading={prices.isLoading} />
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link href={`/basket/${basket.slug}`} className="focus-ring inline-flex min-h-10 items-center rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">Manage</Link>
                    <BasketExitPanel basket={basket} position={position} earnValueMultiplier={earnValueMultiplier} onActiveChange={(active) => {
                      const key = `${wallet.address}:${position.basketSlug}`;
                      setActiveExits((current) => {
                        const next = { ...current };
                        if (active) next[key] = position;
                        else delete next[key];
                        return next;
                      });
                    }} />
                    <a href={`${ARC_EXPLORER_URL}/tx/${position.latestTransactionHash}`} target="_blank" rel="noreferrer" aria-label={`View latest ${basket.name} transaction`} className="focus-ring grid size-10 place-items-center rounded-lg text-muted-foreground hover:text-foreground"><ArrowUpRight aria-hidden="true" size={16} /></a>
                  </div>
                </article>
              );
            })}
          </div>
        ) : hasUnattributedAssets ? (
          <UnattributedHoldings eurcBalance={eurcBalance} cirbtcBalance={cirbtcBalance} />
        ) : (
          <div className="m-5 flex flex-col items-start rounded-xl bg-muted p-5">
            <WalletCards aria-hidden="true" size={28} className="text-muted-foreground" />
            <h3 className="mt-4 font-extrabold">No basket positions yet</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Choose a basket to make your first investment.</p>
            <Link href="/explore" className="focus-ring pressable mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">Explore baskets</Link>
          </div>
        )}
      </section>

      {wallet.address ? <GraphVaultActivity address={wallet.address} /> : null}

    </div>
  );
}

function CrossChainPositionCard({ position, onRemove }: { position: CrossChainBasketPosition; onRemove: () => void }) {
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const active = position.status !== "exited";
  return <article className="p-5 md:px-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-extrabold">Cross-Chain Liquidity</h3><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${active ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>{active ? "Preview" : "Exited"}</span></div><p className="mt-1 text-xs text-muted-foreground">Uniswap V3 #{position.tokenId} · {positionDate(position.createdAt)}</p></div><div className="text-right"><span className="block text-xs font-bold text-muted-foreground">Contributed</span><FormattedNumber value={Number(position.investedUsdc)} type="stable_value" context="detailed" className="mt-1 block text-xl font-extrabold" /></div></div><dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3"><PositionMetric label="Morpho" value={Number(position.morphoUsdc)} token="USDC" /><PositionMetric label="Base" value={Number(position.baseUsdc)} token="USDC" /><PositionMetric label="Reserve" value={Number(position.retainedUsdc)} token="USDC" /></dl>{confirmRemoval ? <div className="mt-4 rounded-xl border border-warning/25 bg-warning/5 p-4"><p className="text-sm font-bold">Remove the local record?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The onchain position is not changed.</p><div className="mt-3 flex gap-2"><button type="button" onClick={onRemove} className="focus-ring min-h-10 rounded-[var(--radius-control)] bg-destructive px-3 text-sm font-bold text-destructive-foreground">Remove</button><button type="button" onClick={() => setConfirmRemoval(false)} className="focus-ring min-h-10 rounded-[var(--radius-control)] bg-secondary px-3 text-sm font-bold">Cancel</button></div></div> : <div className="mt-4 flex flex-wrap items-center gap-2"><Link href="/basket/cross-chain-liquidity-preview" className="focus-ring inline-flex min-h-10 items-center rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">Manage</Link><a href={`https://sepolia.basescan.org/token/0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2?a=${position.tokenId}`} target="_blank" rel="noreferrer" aria-label={`View Uniswap position ${position.tokenId}`} className="focus-ring grid size-10 place-items-center rounded-lg text-muted-foreground hover:text-foreground"><ArrowUpRight aria-hidden="true" size={16} /></a><button type="button" onClick={() => setConfirmRemoval(true)} className="focus-ring min-h-10 rounded-lg px-2 text-xs font-bold text-muted-foreground hover:text-foreground">Remove</button></div>}</article>;
}

function BasketDriftReview({ drift, loading }: { drift: BasketDrift | null; loading: boolean }) {
  const [open, setOpen] = useState(false);
  if (loading) return <div className="mt-4 h-8 w-32 animate-pulse rounded-full bg-muted" aria-label="Calculating allocation drift" aria-busy="true" />;
  if (!drift) return null;
  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className={`focus-ring inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-bold ${drift.needsRebalance ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>Drift <FormattedNumber value={drift.maximumDrift} type="percent" context="compact" /> <span aria-hidden="true">{open ? "−" : "+"}</span></button>
      {open ? <dl className="mt-3 grid max-w-xl gap-2 rounded-xl bg-muted p-3 sm:grid-cols-3">{drift.legs.map((leg) => <div key={leg.symbol} className="flex items-center justify-between gap-3 text-xs"><dt className="font-bold">{leg.symbol}</dt><dd className={Math.abs(leg.drift) >= 5 ? "font-bold text-warning" : "text-muted-foreground"}><FormattedNumber value={leg.currentWeight} type="percent" context="compact" /> / <FormattedNumber value={leg.targetWeight} type="percent" context="compact" /></dd></div>)}</dl> : null}
    </div>
  );
}

function EarnPositionCard({ position }: { position: ArcEarnPosition }) {
  return (
    <article className="p-5 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-extrabold">Arc USDC Earn</h3><span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">Onchain</span></div><p className="mt-1 text-xs text-muted-foreground">{position.vault.name}</p></div>
        <div className="text-right"><span className="block text-xs font-bold text-muted-foreground">Withdrawable</span><FormattedNumber value={Number(position.currentBalance)} type="stable_value" context="detailed" className="mt-1 block text-xl font-extrabold" /></div>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
        <div><dt className="text-xs text-muted-foreground">APY</dt><dd><FormattedNumber value={position.currentApy * 100} type="percent" context="detailed" className="mt-1 block font-bold" /></dd></div>
        <div><dt className="text-xs text-muted-foreground">Yield</dt><dd><FormattedNumber value={position.totalYieldEarned == null ? null : Number(position.totalYieldEarned)} type="stable_value" context="detailed" sign="always" className="mt-1 block font-bold" /></dd></div>
      </dl>
      <Link href="/basket/arc-dollar-yield" className="focus-ring mt-4 inline-flex min-h-10 items-center rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">Manage</Link>
    </article>
  );
}

function AssetCard({ symbol, value, tokenPriceUsd = 1 }: { symbol: string; value: number | null; tokenPriceUsd?: number | null }) {
  return <article className="rounded-[var(--radius-card)] border border-border bg-card p-4 md:p-5"><p className="text-xs font-bold text-muted-foreground">{symbol}</p><FormattedNumber value={value} type="token_amount" context="detailed" tokenPriceUsd={tokenPriceUsd ?? undefined} className="mt-2 block font-mono text-xl font-extrabold tabular-nums md:text-2xl" /></article>;
}

function PositionMetric({ label, value, token, tokenPriceUsd = 1 }: { label: string; value: number; token: string; tokenPriceUsd?: number | null }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd><FormattedNumber value={value} type="token_amount" context="detailed" tokenPriceUsd={tokenPriceUsd ?? undefined} className="mt-1 font-bold" /><span className="ml-1.5 text-xs text-muted-foreground">{token}</span></dd></div>;
}

function StatusBadge({ status }: { status: StoredBasketPosition["status"] }) {
  const label = status === "complete" ? "Complete" : status === "partial" ? "Partial" : status === "failed" ? "Failed" : "Pending";
  return <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${status === "complete" ? "bg-primary/10 text-primary" : status === "failed" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>{label}</span>;
}

function UnattributedHoldings({ eurcBalance, cirbtcBalance }: { eurcBalance: number | null; cirbtcBalance: number | null }) {
  return <article className="p-5 md:px-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-extrabold">Unattributed assets</h3><p className="mt-1 text-xs text-muted-foreground">Held in your wallet without a matching basket record.</p></div><dl className="flex gap-6">{(eurcBalance ?? 0) > 0 ? <PositionMetric label="Wallet" value={eurcBalance ?? 0} token="EURC" /> : null}{(cirbtcBalance ?? 0) > 0 ? <PositionMetric label="Wallet" value={cirbtcBalance ?? 0} token="cirBTC" tokenPriceUsd={null} /> : null}</dl><Link href="/explore" className="focus-ring inline-flex min-h-10 items-center rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground">Explore</Link></div></article>;
}

function WalletGate({ status, pending, login, createWallet, switchToArc }: { status: string; pending: boolean; login: () => void; createWallet: () => Promise<void>; switchToArc: () => Promise<void> }) {
  const content = status === "signed-out"
    ? { title: "Sign in to view your portfolio", description: "Connect your Arc wallet to see balances and basket activity.", label: "Sign in", action: login }
    : status === "wallet-missing"
      ? { title: "Create your Arc wallet", description: "You need an Arc wallet to view balances and invest.", label: "Create wallet", action: createWallet }
      : status === "wrong-chain"
        ? { title: "Switch to Arc Testnet", description: "Positions are read from Arc Testnet only.", label: "Switch to Arc", action: switchToArc }
        : status === "unconfigured"
          ? { title: "Wallet setup is incomplete", description: "Add the Circle client key to enable positions.", label: "", action: () => undefined }
          : null;
  if (!content) return <PositionsSkeleton />;
  return <div className="rounded-[var(--radius-card)] border border-border bg-card p-6 md:p-8"><WalletCards aria-hidden="true" size={28} className="text-primary" /><h2 className="mt-5 text-xl font-extrabold">{content.title}</h2><p className="mt-2 text-sm text-muted-foreground">{content.description}</p>{content.label ? <button type="button" onClick={() => void content.action()} disabled={pending} aria-busy={pending} className="focus-ring mt-5 min-h-11 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-60">{content.label}</button> : null}</div>;
}

function StateMessage({ icon: Icon, title, description, actionLabel, onAction, destructive = false }: { icon: typeof AlertCircle; title: string; description: string; actionLabel: string; onAction: () => void; destructive?: boolean }) {
  return <div className={`rounded-[var(--radius-card)] border p-4 ${destructive ? "border-destructive/25 bg-destructive/5" : "border-border bg-card"}`}><div className="flex gap-3"><Icon aria-hidden="true" size={18} className={destructive ? "text-destructive" : "text-primary"} /><div><h2 className="text-sm font-extrabold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p><button type="button" onClick={onAction} className="focus-ring mt-3 min-h-10 rounded-[var(--radius-control)] bg-secondary px-3 text-sm font-bold text-secondary-foreground">{actionLabel}</button></div></div></div>;
}

function PositionsSkeleton() {
  return <div className="space-y-5" aria-label="Loading positions" aria-busy="true"><div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-muted" /><div className="grid gap-4 sm:grid-cols-2"><div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-muted" /><div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-muted" /></div><div className="h-72 animate-pulse rounded-[var(--radius-card)] bg-muted" /></div>;
}
