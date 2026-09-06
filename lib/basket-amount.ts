import { formatUnits, parseUnits } from "viem";
import type { BasketLeg } from "./baskets";

const MIN_BASKET_AMOUNT = parseUnits("0.01", 6);
const MAX_BASKET_AMOUNT = parseUnits("1000000", 6);

export function parseBasketUsdcAmount(amount: string) {
  if (!/^\d+(\.\d{1,6})?$/.test(amount)) {
    throw new Error("Enter a valid USDC amount with up to six decimal places.");
  }
  const microUsdc = parseUnits(amount, 6);
  if (microUsdc < MIN_BASKET_AMOUNT) throw new Error("Enter at least 0.01 USDC.");
  if (microUsdc > MAX_BASKET_AMOUNT) throw new Error("Use 1,000,000 USDC or less.");
  return microUsdc;
}

export function allocateBasketAmount(legs: BasketLeg[], total: bigint) {
  let allocated = 0n;
  return legs.map((leg, index) => {
    const microUsdc = index === legs.length - 1
      ? total - allocated
      : (total * BigInt(leg.weight)) / 100n;
    allocated += microUsdc;
    return { leg, microUsdc, value: formatUnits(microUsdc, 6) };
  });
}
