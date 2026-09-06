import { ARC_CONTRACTS } from "./arc";

export const basketCategories = ["all", "income", "balanced", "bitcoin", "fx", "cross-chain"] as const;

export type BasketCategory = (typeof basketCategories)[number];
export type BasketReadiness = "testnet" | "restricted" | "reference";
export type BasketRiskLevel = "low" | "moderate" | "high";
export type CoreBasketAsset = "USDC" | "EURC" | "cirBTC";
export type EarnBasketPosition = "EARN-USDC";
export type CrossChainBasketPosition = "UNI-V3-LP";
export type BasketAsset = CoreBasketAsset | EarnBasketPosition | CrossChainBasketPosition;

export type BasketLeg = {
  name: string;
  symbol: BasketAsset;
  weight: number;
  role: string;
  address?: `0x${string}`;
  execution: "hold" | "app-kit-swap" | "app-kit-earn" | "cctp-uniswap-v3";
  protocol?: "Circle App Kit" | "Morpho" | "Uniswap V3";
  routeProtocols?: readonly ("Circle CCTP" | "Uniswap V3")[];
  resourceUrl?: string;
};

export type Basket = {
  slug: string;
  name: string;
  description: string;
  thesis: string;
  version: number;
  inputAsset: "USDC";
  rebalanceMode: "manual";
  executionAvailability: "live" | "limited" | "restricted";
  strategyType: "asset" | "earn" | "composite" | "cross-chain";
  categories: Exclude<BasketCategory, "all">[];
  readiness: BasketReadiness;
  readinessLabel: string;
  riskLevel: BasketRiskLevel;
  timeHorizon: string;
  liquidityLabel: string;
  metricLabel: string;
  metricValue: number;
  metricType: "percent" | "token_amount";
  artwork: "bitcoin" | "index" | "currencies" | "treasury";
  legs: BasketLeg[];
  riskNotes: string[];
};

/**
 * Only baskets whose complete entry path can be quoted and executed through
 * verified Arc Testnet integrations belong in the public catalog.
 */
export const baskets: Basket[] = [
  {
    slug: "arc-dollar-yield",
    name: "Arc Dollar Yield",
    description: "A verified USDC earn position with a liquid reserve for fees and withdrawals.",
    thesis: "Put most of a dollar allocation into the active non-mock USDC vault discovered through Circle EarnKit while keeping enough USDC liquid for gas, withdrawals, and opportunities.",
    version: 1,
    inputAsset: "USDC",
    rebalanceMode: "manual",
    executionAvailability: "live",
    strategyType: "earn",
    categories: ["income"],
    readiness: "testnet",
    readinessLabel: "Verified Morpho vault",
    riskLevel: "low",
    timeHorizon: "3+ months",
    liquidityLabel: "Vault withdrawal",
    metricLabel: "Yield allocation",
    metricValue: 75,
    metricType: "percent",
    artwork: "treasury",
    legs: [
      { name: "EarnKit USDC Vault", symbol: "EARN-USDC", weight: 75, role: "Variable-rate USDC income", execution: "app-kit-earn", protocol: "Morpho", resourceUrl: "https://docs.arc.io/app-kit" },
      { name: "USD Coin", symbol: "USDC", weight: 25, role: "Liquid reserve and Arc gas", address: ARC_CONTRACTS.usdc, execution: "hold" },
    ],
    riskNotes: [
      "APY is variable and is verified again when a quote is requested.",
      "The app rejects mock vaults and any vault with red risk warnings.",
      "Withdrawals depend on current vault liquidity and require a separately approved Arc transaction.",
    ],
  },
  {
    slug: "bitcoin-income",
    name: "Bitcoin Income",
    description: "Bitcoin growth exposure balanced by productive and liquid dollars.",
    thesis: "Pair a measured cirBTC allocation with USDC yield instead of leaving the defensive side entirely idle. A liquid reserve remains available for Arc fees and user-approved rebalances.",
    version: 1,
    inputAsset: "USDC",
    rebalanceMode: "manual",
    executionAvailability: "live",
    strategyType: "composite",
    categories: ["balanced", "bitcoin", "income"],
    readiness: "testnet",
    readinessLabel: "Swap + earn routes live",
    riskLevel: "high",
    timeHorizon: "12+ months",
    liquidityLabel: "Multi-step exit",
    metricLabel: "Income sleeve",
    metricValue: 35,
    metricType: "percent",
    artwork: "bitcoin",
    legs: [
      { name: "Circle Bitcoin", symbol: "cirBTC", weight: 50, role: "Long-term growth exposure", execution: "app-kit-swap", protocol: "Circle App Kit" },
      { name: "EarnKit USDC Vault", symbol: "EARN-USDC", weight: 35, role: "Variable-rate USDC income", execution: "app-kit-earn", protocol: "Morpho", resourceUrl: "https://docs.arc.io/app-kit" },
      { name: "USD Coin", symbol: "USDC", weight: 15, role: "Liquid reserve and Arc gas", address: ARC_CONTRACTS.usdc, execution: "hold" },
    ],
    riskNotes: [
      "cirBTC can lose value and may dominate short-term performance.",
      "Arc Testnet cirBTC liquidity can be thin; every investment requires a fresh protected quote.",
      "The swap and vault deposit execute sequentially, so a partial completion is possible and is never retried automatically.",
    ],
  },
  {
    slug: "global-reserve",
    name: "Global Reserve",
    description: "Dollar income with a deliberate euro diversification sleeve.",
    thesis: "Combine productive USDC with transparent EURC exposure for investors who want income and measured currency diversification without taking crypto-market risk.",
    version: 1,
    inputAsset: "USDC",
    rebalanceMode: "manual",
    executionAvailability: "live",
    strategyType: "composite",
    categories: ["income", "balanced", "fx"],
    readiness: "testnet",
    readinessLabel: "FX + earn routes live",
    riskLevel: "moderate",
    timeHorizon: "6+ months",
    liquidityLabel: "Multi-step exit",
    metricLabel: "Euro sleeve",
    metricValue: 35,
    metricType: "percent",
    artwork: "currencies",
    legs: [
      { name: "Euro Coin", symbol: "EURC", weight: 35, role: "Euro currency diversification", address: ARC_CONTRACTS.eurc, execution: "app-kit-swap", protocol: "Circle App Kit" },
      { name: "EarnKit USDC Vault", symbol: "EARN-USDC", weight: 45, role: "Variable-rate dollar income", execution: "app-kit-earn", protocol: "Morpho", resourceUrl: "https://docs.arc.io/app-kit" },
      { name: "USD Coin", symbol: "USDC", weight: 20, role: "Liquid reserve and Arc gas", address: ARC_CONTRACTS.usdc, execution: "hold" },
    ],
    riskNotes: [
      "EURC is designed to track the euro, so its US dollar value moves with EUR/USD.",
      "The vault APY is variable and is not guaranteed.",
      "The EURC swap and vault deposit execute sequentially with separately verified quotes.",
    ],
  },
  {
    slug: "cross-chain-liquidity-preview",
    name: "Cross-Chain Liquidity Preview",
    description: "Arc-native yield with a capped Uniswap liquidity sleeve routed to Base through CCTP.",
    thesis: "Demonstrate how Arc capital can reach established external liquidity today, then collapse the route back onto Arc when Uniswap is available on Arc mainnet. Most capital remains productive or liquid on Arc.",
    version: 1,
    inputAsset: "USDC",
    rebalanceMode: "manual",
    executionAvailability: "live",
    strategyType: "cross-chain",
    categories: ["balanced", "income", "cross-chain"],
    readiness: "testnet",
    readinessLabel: "Experimental cross-chain route",
    riskLevel: "high",
    timeHorizon: "6+ months",
    liquidityLabel: "Multi-chain exit",
    metricLabel: "Base liquidity sleeve",
    metricValue: 20,
    metricType: "percent",
    artwork: "index",
    legs: [
      { name: "EarnKit USDC Vault", symbol: "EARN-USDC", weight: 60, role: "Arc-native variable-rate income", execution: "app-kit-earn", protocol: "Morpho", resourceUrl: "https://docs.arc.io/app-kit" },
      { name: "Uniswap V3 USDC/WETH", symbol: "UNI-V3-LP", weight: 20, role: "Base liquidity-provider fee exposure", execution: "cctp-uniswap-v3", protocol: "Uniswap V3", routeProtocols: ["Circle CCTP", "Uniswap V3"], resourceUrl: "https://docs.uniswap.org/contracts/v3/overview" },
      { name: "USD Coin", symbol: "USDC", weight: 20, role: "Liquid reserve and Arc gas", address: ARC_CONTRACTS.usdc, execution: "hold" },
    ],
    riskNotes: [
      "This experimental Testnet route bridges canonical USDC from Arc to Base Sepolia through Circle CCTP.",
      "The Uniswap position holds USDC and WETH, so it carries ETH price, impermanent-loss, liquidity, and smart-contract risk.",
      "The Testnet adapter rejects obviously distorted USDC/WETH pool prices before it presents an executable route.",
      "CCTP, the Base swap, and LP mint are separate transactions. The app preserves completed steps and never restarts a completed bridge burn.",
      "Circle Gas Station sponsors the Arc and Base wallet operations; CCTP attestation and cross-chain settlement still complete asynchronously.",
    ],
  },
  {
    slug: "arc-balanced",
    name: "Arc Balanced",
    description: "Arc's verified liquid assets and USDC income in one allocation.",
    thesis: "Own a compact cross-section of Arc's currently executable investment set: cirBTC for growth, a verified USDC vault for income, EURC for currency diversification, and liquid USDC for flexibility.",
    version: 1,
    inputAsset: "USDC",
    rebalanceMode: "manual",
    executionAvailability: "live",
    strategyType: "composite",
    categories: ["balanced", "bitcoin", "income", "fx"],
    readiness: "testnet",
    readinessLabel: "Three verified routes",
    riskLevel: "high",
    timeHorizon: "12+ months",
    liquidityLabel: "Multi-step exit",
    metricLabel: "Income sleeve",
    metricValue: 30,
    metricType: "percent",
    artwork: "index",
    legs: [
      { name: "Circle Bitcoin", symbol: "cirBTC", weight: 40, role: "Crypto growth exposure", execution: "app-kit-swap", protocol: "Circle App Kit" },
      { name: "Euro Coin", symbol: "EURC", weight: 20, role: "Euro currency diversification", address: ARC_CONTRACTS.eurc, execution: "app-kit-swap", protocol: "Circle App Kit" },
      { name: "EarnKit USDC Vault", symbol: "EARN-USDC", weight: 30, role: "Variable-rate USDC income", execution: "app-kit-earn", protocol: "Morpho", resourceUrl: "https://docs.arc.io/app-kit" },
      { name: "USD Coin", symbol: "USDC", weight: 10, role: "Liquid reserve and Arc gas", address: ARC_CONTRACTS.usdc, execution: "hold" },
    ],
    riskNotes: [
      "This basket combines price, FX, smart-contract, and liquidity risk.",
      "All three active legs are freshly quoted before signing, but they execute sequentially.",
      "A later leg can fail after an earlier swap or deposit has finalized; the app records and explains any partial completion.",
    ],
  },
];

const legacyBasketAliases: Record<string, string> = {
  "arc-usdc-earn": "arc-dollar-yield",
  "bitcoin-barbell": "bitcoin-income",
  "reserve-currency-mix": "global-reserve",
  "arc-triple-index": "arc-balanced",
  "hard-money-treasuries": "arc-balanced",
  "treasury-buffer": "arc-dollar-yield",
};

export function getBasket(slug: string) {
  const canonicalSlug = legacyBasketAliases[slug] ?? slug;
  return baskets.find((basket) => basket.slug === canonicalSlug);
}

export function basketAllocationsAreValid(basket: Basket) {
  return basket.legs.length >= 2 && basket.legs.reduce((total, leg) => total + leg.weight, 0) === 100;
}
