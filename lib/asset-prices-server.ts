import "server-only";
import { createRequestTimeoutSignal } from "./request-timeout";

const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,euro-coin,usd-coin&vs_currencies=usd";

type PriceResponse = Record<string, { usd?: number }>;

export type ArcAssetPrices = {
  asOf: number;
  USDC: number;
  EURC: number;
  cirBTC: number;
};

export async function getArcAssetPrices(): Promise<ArcAssetPrices> {
  const response = await fetch(PRICE_URL, {
    headers: { Accept: "application/json", "User-Agent": "ArcSet/0.2" },
    next: { revalidate: 300 },
    signal: createRequestTimeoutSignal(8_000),
  });
  if (!response.ok) throw new Error(`Market data provider returned ${response.status}.`);
  const data = await response.json() as PriceResponse;
  const cirBTC = data.bitcoin?.usd;
  const EURC = data["euro-coin"]?.usd;
  const USDC = data["usd-coin"]?.usd;
  if (![cirBTC, EURC, USDC].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) {
    throw new Error("Market data provider returned incomplete Arc asset prices.");
  }
  return { asOf: Date.now(), cirBTC: cirBTC!, EURC: EURC!, USDC: USDC! };
}
