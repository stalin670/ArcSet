import { describe, expect, it } from "vitest";
import { assessIndexedVault } from "./vault-eligibility";

const morpho = { id: "morpho", totalValueLockedUSD: "100000", strategyActive: null, eligibility: "ELIGIBLE" as const, eligibilityReason: "EarnKit verified." };
const xylo = { id: "xylo", totalValueLockedUSD: "8000000", strategyActive: false, eligibility: "REJECTED" as const, eligibilityReason: "Zero strategy address." };

describe("assessIndexedVault", () => {
  it("accepts a screened vault when indexing is fresh", () => {
    expect(assessIndexedVault(morpho, { arcBlock: 10_000, indexedBlock: 9_900, hasIndexingErrors: false }).status).toBe("eligible");
  });

  it("rejects an inactive strategy regardless of TVL", () => {
    expect(assessIndexedVault(xylo, { arcBlock: 10_000, indexedBlock: 1, hasIndexingErrors: false }).status).toBe("rejected");
  });

  it("withholds eligibility while the indexer is materially behind", () => {
    expect(assessIndexedVault(morpho, { arcBlock: 10_000, indexedBlock: 1, hasIndexingErrors: false }).status).toBe("syncing");
  });
});
