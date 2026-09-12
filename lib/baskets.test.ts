import { describe, expect, it } from "vitest";
import { basketAllocationsAreValid, basketCategories, baskets } from "./baskets";

describe("ArcSet strategies", () => {
  it("contains only focused DeFi investment categories", () => {
    expect(basketCategories).toEqual(["all", "income", "balanced", "bitcoin", "fx", "cross-chain"]);
  });

  it("uses at least two weighted legs totaling exactly 100%", () => {
    for (const basket of baskets) expect(basketAllocationsAreValid(basket)).toBe(true);
  });

  it("publishes only live USDC-funded strategies", () => {
    expect(baskets.map((basket) => basket.slug)).toEqual([
      "arc-dollar-yield",
      "bitcoin-income",
      "global-reserve",
      "cross-chain-liquidity-preview",
      "arc-balanced",
    ]);
    expect(baskets.every((basket) => basket.inputAsset === "USDC" && basket.executionAvailability === "live")).toBe(true);
  });

  it("uses only verified App Kit, EarnKit, and wallet custody legs", () => {
    expect(baskets.every((basket) => basket.legs.every((leg) => ["hold", "app-kit-swap", "app-kit-earn", "cctp-uniswap-v3"].includes(leg.execution)))).toBe(true);
    expect(baskets.every((basket) => basket.legs.some((leg) => leg.execution === "hold" && leg.symbol === "USDC"))).toBe(true);
  });

  it("contains no prediction-market or restricted institutional assets", () => {
    const symbols = baskets.flatMap((basket) => basket.legs.map((leg) => leg.symbol));
    expect(symbols).toEqual(expect.not.arrayContaining(["USYC", "ARCT", "YES", "NO"]));
    expect(baskets.every((basket) => basket.strategyType === "earn" || basket.strategyType === "composite" || basket.strategyType === "cross-chain")).toBe(true);
  });
});
