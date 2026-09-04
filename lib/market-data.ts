import type { CoreBasketAsset } from "./baskets";

export type BasketMarketPoint = {
  timestamp: number;
  value: number;
};

export type BasketAssetMarketData = {
  symbol: CoreBasketAsset;
  priceUsd: number;
  change24hPercent: number | null;
  sourceLabel: string;
};

export type BasketMarketData = {
  asOf: number;
  periodDays: number;
  returnPercent: number;
  startValue: number;
  currentValue: number;
  series: BasketMarketPoint[];
  assets: BasketAssetMarketData[];
};
