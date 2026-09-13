import { describe, expect, it } from "vitest";
import { arcSwapConfig, normalizeArcSwapOutputToken, normalizeArcSwapToken } from "./arc-swap-client";

describe("Arc swap token normalization", () => {
  it("normalizes App Kit token aliases for display and execution", () => {
    expect(normalizeArcSwapOutputToken("EURC")).toBe("EURC");
    expect(normalizeArcSwapOutputToken("CIRBTC")).toBe("cirBTC");
    expect(normalizeArcSwapOutputToken("cirBTC")).toBe("cirBTC");
  });

  it("rejects outputs outside the verified ArcSet asset universe", () => {
    expect(() => normalizeArcSwapOutputToken("USDT")).toThrow(/Unsupported/);
  });

  it("supports USDC as the destination for basket exits", () => {
    expect(normalizeArcSwapToken("USDC")).toBe("USDC");
    expect(normalizeArcSwapToken("CIRBTC")).toBe("cirBTC");
  });

  it("uses explicit approval and relative slippage for embedded-wallet swaps", () => {
    expect(arcSwapConfig(100)).toEqual({ allowanceStrategy: "approve", batchTransactions: true, slippageBps: 100 });
    expect(arcSwapConfig(100)).not.toHaveProperty("stopLimit");
  });
});
