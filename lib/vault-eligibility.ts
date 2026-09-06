export type IndexedVaultEvidence = {
  id: string;
  totalValueLockedUSD: string;
  strategyActive?: boolean | null;
  eligibility: "ELIGIBLE" | "EXPERIMENTAL" | "REJECTED";
  eligibilityReason: string;
};

export type VaultAssessment = {
  status: "eligible" | "experimental" | "rejected" | "syncing" | "unavailable";
  label: string;
  reason: string;
};

export const MAX_HEALTHY_INDEX_LAG_BLOCKS = 1_200;

export function assessIndexedVault(
  vault: IndexedVaultEvidence,
  context: { arcBlock: number; indexedBlock: number | null; hasIndexingErrors: boolean },
): VaultAssessment {
  if (context.hasIndexingErrors) return { status: "unavailable", label: "Data unavailable", reason: "The Graph provider reports indexing errors." };
  if (vault.eligibility === "REJECTED" || vault.strategyActive === false) {
    return { status: "rejected", label: "Rejected", reason: vault.eligibilityReason };
  }
  if (context.indexedBlock == null || context.arcBlock - context.indexedBlock > MAX_HEALTHY_INDEX_LAG_BLOCKS) {
    return { status: "syncing", label: "Indexer syncing", reason: "Eligibility is withheld until standardized data is close to the Arc chain head." };
  }
  if (vault.eligibility === "EXPERIMENTAL" || Number(vault.totalValueLockedUSD) <= 0) {
    return { status: "experimental", label: "Experimental", reason: vault.eligibilityReason };
  }
  return { status: "eligible", label: "Eligible", reason: vault.eligibilityReason };
}
