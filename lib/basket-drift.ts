import type { Basket, BasketAsset, CrossChainBasketPosition } from "./baskets";
import type { AggregatedBasketPosition } from "./positions";

export type BasketValuationPrices = Record<Exclude<BasketAsset, CrossChainBasketPosition>, number> & Partial<Record<CrossChainBasketPosition, number>>;

export type BasketDriftLeg = {
  symbol: BasketAsset;
  targetWeight: number;
  currentWeight: number;
  drift: number;
  currentAmount: number;
  currentValue: number;
  targetValue: number;
  action: "buy" | "sell" | "hold";
  actionValue: number;
};

export type BasketDrift = {
  currentValue: number;
  maximumDrift: number;
  needsRebalance: boolean;
  legs: BasketDriftLeg[];
};

const REBALANCE_THRESHOLD_PERCENT = 5;

export function calculateBasketDrift(
  basket: Basket,
  position: AggregatedBasketPosition,
  prices: BasketValuationPrices,
): BasketDrift {
  const amounts = new Map<BasketAsset, number>([["USDC", Number(position.retainedUsdc)]]);
  for (const output of position.outputs) amounts.set(output.token, Number(output.amount));
  const currentValue = basket.legs.reduce((total, leg) => total + (amounts.get(leg.symbol) ?? 0) * (prices[leg.symbol] ?? 0), 0);
  const legs = basket.legs.map((leg): BasketDriftLeg => {
    const currentAmount = amounts.get(leg.symbol) ?? 0;
    const value = currentAmount * (prices[leg.symbol] ?? 0);
    const currentWeight = currentValue > 0 ? (value / currentValue) * 100 : 0;
    const drift = currentWeight - leg.weight;
    const targetValue = currentValue * leg.weight / 100;
    const difference = targetValue - value;
    return {
      symbol: leg.symbol,
      targetWeight: leg.weight,
      currentWeight,
      drift,
      currentAmount,
      currentValue: value,
      targetValue,
      action: Math.abs(difference) < 0.01 ? "hold" : difference > 0 ? "buy" : "sell",
      actionValue: Math.abs(difference),
    };
  });
  const maximumDrift = Math.max(0, ...legs.map((leg) => Math.abs(leg.drift)));
  return { currentValue, maximumDrift, needsRebalance: maximumDrift >= REBALANCE_THRESHOLD_PERCENT, legs };
}
