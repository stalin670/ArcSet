import "server-only";
import { isAddress } from "viem";
import { unstable_cache } from "next/cache";
import {
  ARC_YIELD_ACCOUNT_ACTIVITY_QUERY,
  ARC_YIELD_VAULT_QUERY,
  type ArcYieldIndexerSnapshot,
  type StandardizedVaultActivity,
  type StandardizedYieldProtocol,
  type StandardizedYieldVault,
} from "@/lib/graph-yield";

const INDEXER_TIMEOUT_MS = 8_000;
const INDEXER_CACHE_SECONDS = 120;

type GraphResponse<T> = { data?: T; errors?: Array<{ message?: string }> };
type VaultMetricsResult = {
  _meta: { block: { number: number; timestamp?: number | null }; hasIndexingErrors: boolean };
  yieldAggregators: StandardizedYieldProtocol[];
  vaults: StandardizedYieldVault[];
};
type AccountActivityResult = { deposits: StandardizedVaultActivity[]; withdraws: StandardizedVaultActivity[] };

function graphEndpoint() {
  if (process.env.ARC_YIELD_SUBGRAPH_URL) return process.env.ARC_YIELD_SUBGRAPH_URL;
  if (process.env.GRAPH_API_KEY && process.env.ARC_YIELD_SUBGRAPH_ID) {
    return `https://gateway.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/${process.env.ARC_YIELD_SUBGRAPH_ID}`;
  }
  return null;
}

async function queryGraph<T>(endpoint: string, query: string, variables?: Record<string, string>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(INDEXER_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`The Graph provider returned ${response.status}.`);
  const payload = await response.json() as GraphResponse<T>;
  if (payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.[0]?.message ?? "The Graph provider returned no data.");
  }
  return payload.data;
}

const readCachedVaultMetrics = unstable_cache(
  async () => {
    const endpoint = graphEndpoint();
    if (!endpoint) return null;
    return queryGraph<VaultMetricsResult>(endpoint, ARC_YIELD_VAULT_QUERY);
  },
  ["arc-yield-standardized-metrics-v3"],
  { revalidate: INDEXER_CACHE_SECONDS, tags: ["arc-yield-standardized-metrics"] },
);

const readCachedAccountActivity = unstable_cache(
  async (account: string) => {
    const endpoint = graphEndpoint();
    if (!endpoint) return { deposits: [], withdraws: [] } as AccountActivityResult;
    return queryGraph<AccountActivityResult>(endpoint, ARC_YIELD_ACCOUNT_ACTIVITY_QUERY, { account });
  },
  ["arc-yield-account-activity-v2"],
  { revalidate: INDEXER_CACHE_SECONDS, tags: ["arc-yield-account-activity"] },
);

export async function readArcYieldIndexerSnapshot(account?: string): Promise<ArcYieldIndexerSnapshot> {
  const endpoint = graphEndpoint();
  if (!endpoint) {
    return {
      configured: false,
      source: "not-configured",
      indexedBlock: null,
      indexedTimestamp: null,
      hasIndexingErrors: false,
      protocols: [],
      vaults: [],
      activity: { deposits: [], withdraws: [] },
    };
  }
  if (account && !isAddress(account, { strict: false })) throw new TypeError("Invalid EVM wallet address.");

  const metrics = await readCachedVaultMetrics();
  if (!metrics) throw new Error("The Graph endpoint is not configured.");
  const activity = account
    ? await readCachedAccountActivity(account.toLowerCase())
    : { deposits: [], withdraws: [] };

  return {
    configured: true,
    source: "the-graph",
    indexedBlock: metrics._meta.block.number,
    indexedTimestamp: metrics._meta.block.timestamp ?? null,
    hasIndexingErrors: metrics._meta.hasIndexingErrors,
    protocols: metrics.yieldAggregators,
    vaults: metrics.vaults,
    activity,
  };
}
