import { describe, expect, it } from "vitest";
import { allocateBasketAmount, parseBasketUsdcAmount } from "./basket-amount";
import { getBasket } from "./baskets";

describe("basket USDC allocation", () => {
  it("uses six-decimal USDC accounting", () => {
    expect(parseBasketUsdcAmount("10.123456")).toBe(10_123_456n);
    expect(() => parseBasketUsdcAmount("10.1234567")).toThrow(/six decimal places/);
  });

  it("enforces useful minimum and maximum amounts", () => {
    expect(() => parseBasketUsdcAmount("0.001")).toThrow(/at least 0.01/);
    expect(() => parseBasketUsdcAmount("1000000.01")).toThrow(/1,000,000/);
  });

  it("allocates Global Reserve without losing micro-USDC", () => {
    const basket = getBasket("global-reserve");
    expect(basket).toBeDefined();
    const allocations = allocateBasketAmount(basket!.legs, parseBasketUsdcAmount("10"));
    expect(allocations.map(({ value }) => value)).toEqual(["3.5", "4.5", "2"]);
    expect(allocations.reduce((sum, allocation) => sum + allocation.microUsdc, 0n)).toBe(10_000_000n);
  });
});
