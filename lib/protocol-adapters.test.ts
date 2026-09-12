import { describe, expect, it } from "vitest";
import { baskets } from "./baskets";
import { basketHasCompleteLifecycle, protocolRoadmap, validateBasketIntegrations } from "./protocol-adapters";

describe("protocol adapter registry", () => {
  it("publishes only baskets with complete verified lifecycles", () => {
    for (const basket of baskets) {
      expect(validateBasketIntegrations(basket)).toEqual([]);
      expect(basketHasCompleteLifecycle(basket)).toBe(true);
    }
  });

  it("keeps announced protocols on the roadmap instead of the live catalog", () => {
    expect(protocolRoadmap.map((item) => item.protocol)).toEqual(["Aave V4", "Uniswap on Arc"]);
    expect(protocolRoadmap.every((item) => item.status === "awaiting-official-deployment")).toBe(true);
  });
});
