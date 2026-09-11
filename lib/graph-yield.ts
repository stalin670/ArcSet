export const ARC_YIELD_VAULT_QUERY = `
  query ArcYieldMetrics {
    _meta { block { number timestamp } hasIndexingErrors }
    yieldAggregators(first: 10, orderBy: name, orderDirection: asc) {
      id name slug schemaVersion subgraphVersion methodologyVersion
      network type totalValueLockedUSD cumulativeSupplySideRevenueUSD
      cumulativeProtocolSideRevenueUSD cumulativeTotalRevenueUSD
      cumulativeUniqueUsers totalPoolCount
    }
    vaults(first: 10, orderBy: totalValueLockedUSD, orderDirection: desc) {
      id name symbol totalValueLockedUSD inputTokenBalance outputTokenSupply
      outputTokenPriceUSD pricePerShare cumulativeSupplySideRevenueUSD
      cumulativeProtocolSideRevenueUSD cumulativeTotalRevenueUSD
      strategyAddress strategyActive eligibility eligibilityReason
      protocol { id name }
      inputToken { id name symbol decimals }
    }
  }
`;

export const ARC_YIELD_ACCOUNT_ACTIVITY_QUERY = `
  query ArcYieldAccountActivity($account: String!) {
    deposits(first: 50, orderBy: timestamp, orderDirection: desc, where: { account: $account }) {
      id hash logIndex from to amount amountUSD shares blockNumber timestamp
      account { id }
      vault { id name protocol { id name } }
    }
    withdraws(first: 50, orderBy: timestamp, orderDirection: desc, where: { account: $account }) {
      id hash logIndex from to amount amountUSD shares blockNumber timestamp
      account { id }
      vault { id name protocol { id name } }
    }
  }
`;

export type StandardizedYieldProtocol = {
  id: string;
  name: string;
  slug: string;
  schemaVersion: string;
  subgraphVersion: string;
  methodologyVersion: string;
  network: "ARC_TESTNET";
  type: "YIELD";
  totalValueLockedUSD: string;
  cumulativeUniqueUsers: number;
  totalPoolCount: number;
};

export type StandardizedYieldVault = {
  id: string;
  name?: string | null;
  symbol?: string | null;
  totalValueLockedUSD: string;
  inputTokenBalance: string;
  outputTokenSupply?: string | null;
  outputTokenPriceUSD?: string | null;
  pricePerShare?: string | null;
  strategyAddress?: string | null;
  strategyActive?: boolean | null;
  eligibility: "ELIGIBLE" | "EXPERIMENTAL" | "REJECTED";
  eligibilityReason: string;
  protocol: { id: string; name: string };
  inputToken: { id: string; name: string; symbol: string; decimals: number };
};

export type StandardizedVaultActivity = {
  id: string;
  hash: string;
  logIndex: number;
  from: string;
  to: string;
  amount: string;
  amountUSD: string;
  shares: string;
  blockNumber: string;
  timestamp: string;
  account: { id: string };
  vault: { id: string; name?: string | null; protocol: { id: string; name: string } };
};

export type ArcYieldIndexerSnapshot = {
  configured: boolean;
  source: "the-graph" | "not-configured";
  indexedBlock: number | null;
  indexedTimestamp: number | null;
  hasIndexingErrors: boolean;
  unavailable?: boolean;
  errorMessage?: string;
  protocols: StandardizedYieldProtocol[];
  vaults: StandardizedYieldVault[];
  activity: { deposits: StandardizedVaultActivity[]; withdraws: StandardizedVaultActivity[] };
};
