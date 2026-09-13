import { describe, expect, it } from "vitest";
import { bridgeTransactionSteps, validateCctpTransferAmount } from "./cctp-client";
import type { BridgeResult } from "@circle-fin/app-kit";

describe("CCTP result helpers", () => {
  it("keeps only transaction-backed bridge steps", () => {
    const result = {
      state: "success",
      amount: "2",
      token: "USDC",
      provider: "CCTPV2BridgingProvider",
      source: { address: "0x1", chain: {} },
      destination: { address: "0x1", chain: {} },
      steps: [
        { name: "approve", state: "success", txHash: `0x${"a".repeat(64)}` },
        { name: "fetchAttestation", state: "success" },
        { name: "mint", state: "success", txHash: `0x${"b".repeat(64)}` },
      ],
    } as unknown as BridgeResult;
    expect(bridgeTransactionSteps(result).map((step) => step.name)).toEqual(["approve", "mint"]);
  });

  it("rejects Arc burns that cannot exceed the CCTP max-fee boundary", () => {
    expect(() => validateCctpTransferAmount("arc-to-base", "1.2")).toThrow(/at least 1.5 USDC/);
    expect(() => validateCctpTransferAmount("arc-to-base", "2")).not.toThrow();
    expect(() => validateCctpTransferAmount("base-to-arc", "1.2")).not.toThrow();
  });
});
