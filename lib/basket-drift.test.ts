import { describe, expect, it } from "vitest";
import { getBasket } from "./baskets";
import { calculateBasketDrift } from "./basket-drift";
import type { AggregatedBasketPosition } from "./positions";

describe("basket drift", () => {
  it("marks a basket for rebalancing when an asset moves beyond five points", () => {
    const basket = getBasket("bitcoin-income")!;
    const position: AggregatedBasketPosition = {
      basketSlug: basket.slug,
      investedUsdc: "100",
      retainedUsdc: "15",
      outputs: [
        { token: "cirBTC", amount: "0.0005", estimated: false },
        { token: "EARN-USDC", amount: "35", estimated: false },
      ],
      executionCount: 1,
      transactionCount: 2,
      latestTransactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      latestCreatedAt: 1,
      status: "complete",
    };
    const drift = calculateBasketDrift(basket, position, { USDC: 1, EURC: 1, cirBTC: 140_000, "EARN-USDC": 1 });
    expect(drift.needsRebalance).toBe(true);
    expect(drift.legs.find((leg) => leg.symbol === "cirBTC")?.action).toBe("sell");
    expect(drift.legs.find((leg) => leg.symbol === "EARN-USDC")?.action).toBe("buy");
  });
});
