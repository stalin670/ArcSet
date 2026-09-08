import "server-only";
import type { Basket, CoreBasketAsset } from "./baskets";
import type { BasketMarketData } from "./market-data";
import { createRequestTimeoutSignal } from "./request-timeout";

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 365;
const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const COINGECKO_TIMEOUT_MS = 8_000;

const COINGECKO_ID: Record<CoreBasketAsset, string> = {
  cirBTC: "bitcoin",
  USDC: "usd-coin",
  EURC: "euro-coin",
};

type PricePoint = [timestamp: number, price: number];
type MarketChartResponse = { prices?: PricePoint[] };
type SimplePriceResponse = Record<string, { usd?: number; usd_24h_change?: number }>;

async function fetchCoinGecko<T>(path: string): Promise<T> {
  const response = await fetch(`${COINGECKO_BASE_URL}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "ArcSet/0.1" },
    next: { revalidate: 900 },
    signal: createRequestTimeoutSignal(COINGECKO_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Market data provider returned ${response.status}.`);
  return await response.json() as T;
}

function priceForDay(points: PricePoint[], day: number) {
  const timestamp = (day + 1) * DAY_MS - 1;
  let low = 0;
  let high = points.length - 1;
  let result: number | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle][0] <= timestamp) {
      result = points[middle][1];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

export async function getBasketMarketData(basket: Basket): Promise<BasketMarketData> {
  if (basket.strategyType !== "asset") {
    throw new TypeError("Reference baskets do not have historical on-chain prices.");
  }
  const coreLegs = basket.legs.map((leg) => ({ ...leg, symbol: leg.symbol as CoreBasketAsset }));
  const symbols = [...new Set(coreLegs.map((leg) => leg.symbol))];
  const ids = symbols.map((symbol) => COINGECKO_ID[symbol]);
  const [simple, ...histories] = await Promise.all([
    fetchCoinGecko<SimplePriceResponse>(`/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`),
    ...ids.map((id) => fetchCoinGecko<MarketChartResponse>(`/coins/${id}/market_chart?vs_currency=usd&days=${HISTORY_DAYS}&interval=daily`)),
  ]);

  const historyBySymbol = new Map<CoreBasketAsset, PricePoint[]>();
  symbols.forEach((symbol, index) => {
    const points = histories[index].prices?.filter((point) => Number.isFinite(point[1])) ?? [];
    if (!points.length) throw new Error(`No market history is available for ${symbol}.`);
    historyBySymbol.set(symbol, points);
  });

  const firstDays = symbols.map((symbol) => Math.floor(historyBySymbol.get(symbol)![0][0] / DAY_MS));
  const lastDays = symbols.map((symbol) => {
    const points = historyBySymbol.get(symbol)!;
    return Math.floor(points[points.length - 1][0] / DAY_MS);
  });
  const startDay = Math.max(...firstDays);
  const endDay = Math.min(...lastDays);
  const initialPrice = new Map<CoreBasketAsset, number>();
  symbols.forEach((symbol) => {
    const value = priceForDay(historyBySymbol.get(symbol)!, startDay);
    if (value == null || value <= 0) throw new Error(`No starting price is available for ${symbol}.`);
    initialPrice.set(symbol, value);
  });

  const series = [];
  for (let day = startDay; day <= endDay; day += 1) {
    let indexValue = 0;
    let complete = true;
    for (const leg of coreLegs) {
      const price = priceForDay(historyBySymbol.get(leg.symbol)!, day);
      if (price == null) {
        complete = false;
        break;
      }
      indexValue += leg.weight * (price / initialPrice.get(leg.symbol)!);
    }
    if (complete) series.push({ timestamp: day * DAY_MS, value: indexValue });
  }
  if (series.length < 2) throw new Error("Not enough aligned market history is available.");

  const currentValue = series[series.length - 1].value;
  const assets = symbols.map((symbol) => {
    const current = simple[COINGECKO_ID[symbol]];
    const fallbackPrice = historyBySymbol.get(symbol)!.at(-1)![1];
    return {
      symbol,
      priceUsd: current?.usd ?? fallbackPrice,
      change24hPercent: current?.usd_24h_change ?? null,
      sourceLabel: symbol === "cirBTC" ? "BTC reference price" : "CoinGecko market price",
    };
  });

  return {
    asOf: Date.now(),
    periodDays: endDay - startDay,
    returnPercent: currentValue - 100,
    startValue: 100,
    currentValue,
    series,
    assets,
  };
}
