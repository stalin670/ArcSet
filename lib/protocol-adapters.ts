import type { Basket, BasketLeg } from "./baskets";

export type ProtocolCapability =
  | "quote-entry"
  | "execute-entry"
  | "quote-exit"
  | "execute-exit"
  | "position-read"
  | "valuation"
  | "slippage-protection";

export type ProtocolAdapterDefinition = {
  id: BasketLeg["execution"];
  name: string;
  protocol: string;
  status: "live";
  capabilities: readonly ProtocolCapability[];
  safetyBoundary: string;
};

export const protocolAdapters = {
  hold: {
    id: "hold",
    name: "Arc wallet custody",
    protocol: "Arc",
    status: "live",
    capabilities: ["position-read", "valuation"],
    safetyBoundary: "The asset remains in the user's embedded Arc wallet.",
  },
  "app-kit-swap": {
    id: "app-kit-swap",
    name: "Circle App Kit Swap",
    protocol: "Circle App Kit",
    status: "live",
    capabilities: ["quote-entry", "execute-entry", "quote-exit", "execute-exit", "position-read", "valuation", "slippage-protection"],
    safetyBoundary: "Every swap uses a fresh quote and an enforceable minimum output.",
  },
  "app-kit-earn": {
    id: "app-kit-earn",
    name: "Circle EarnKit vault",
    protocol: "Morpho",
    status: "live",
    capabilities: ["quote-entry", "execute-entry", "quote-exit", "execute-exit", "position-read", "valuation"],
    safetyBoundary: "Discovery rejects mock vaults, inactive vaults, non-USDC assets, and red risk warnings.",
  },
  "cctp-uniswap-v3": {
    id: "cctp-uniswap-v3",
    name: "CCTP to Uniswap V3",
    protocol: "Circle CCTP + Uniswap V3",
    status: "live",
    capabilities: ["quote-entry", "execute-entry", "quote-exit", "execute-exit", "position-read", "valuation", "slippage-protection"],
    safetyBoundary: "The Base sleeve is capped, uses canonical CCTP USDC, exact approvals, protected Uniswap quotes, and a wide-range LP position.",
  },
} as const satisfies Record<BasketLeg["execution"], ProtocolAdapterDefinition>;

export const protocolRoadmap = [
  { protocol: "Aave V4", status: "awaiting-official-deployment", requirement: "Official Arc deployment addresses, live liquidity, risk parameters, supply and withdrawal tests." },
  { protocol: "Uniswap on Arc", status: "awaiting-official-deployment", requirement: "Official Arc deployment addresses, liquid pools, protected entry and full LP exit support." },
] as const;

export function validateBasketIntegrations(basket: Basket) {
  const issues: string[] = [];
  if (basket.inputAsset !== "USDC") issues.push("The public catalog accepts USDC-funded baskets only.");
  if (basket.executionAvailability !== "live") issues.push("Every public basket must have a live execution path.");
  if (basket.legs.reduce((total, leg) => total + leg.weight, 0) !== 100) issues.push("Basket weights must total 100%.");
  if (!basket.legs.some((leg) => leg.execution !== "hold")) issues.push("A basket needs at least one productive or market-exposure leg.");
  if (!basket.legs.some((leg) => leg.execution === "hold" && leg.symbol === "USDC")) issues.push("A basket needs a liquid USDC reserve for Arc gas and recovery.");
  for (const leg of basket.legs) {
    const adapter = protocolAdapters[leg.execution];
    if (!adapter) issues.push(`${leg.name} has no registered execution adapter.`);
    if (leg.execution === "app-kit-swap" && leg.symbol !== "EURC" && leg.symbol !== "cirBTC") {
      issues.push(`${leg.symbol} is not supported by the Arc swap adapter.`);
    }
    if (leg.execution === "app-kit-earn" && leg.symbol !== "EARN-USDC") {
      issues.push(`${leg.symbol} is not supported by the EarnKit adapter.`);
    }
    if (leg.execution === "cctp-uniswap-v3" && leg.symbol !== "UNI-V3-LP") {
      issues.push(`${leg.symbol} is not supported by the cross-chain Uniswap adapter.`);
    }
  }
  return issues;
}

export function basketProtocols(basket: Basket) {
  const protocols: string[] = [];
  for (const leg of basket.legs) protocols.push(...(leg.routeProtocols ?? [protocolAdapters[leg.execution].protocol]));
  return [...new Set(protocols)];
}

export function basketHasCompleteLifecycle(basket: Basket) {
  if (validateBasketIntegrations(basket).length) return false;
  return basket.legs.every((leg) => {
    if (leg.execution === "hold") return true;
    const capabilities = new Set<ProtocolCapability>(protocolAdapters[leg.execution].capabilities);
    return ["quote-entry", "execute-entry", "quote-exit", "execute-exit", "position-read", "valuation"].every((capability) => capabilities.has(capability as ProtocolCapability));
  });
}
