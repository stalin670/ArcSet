import { formatUnits, parseUnits } from "viem";
import { ARC_TESTNET } from "./arc";

export const POSITION_STORAGE_KEY = "arc-set:positions:v2";
const PREVIOUS_POSITION_STORAGE_KEY = "arc-basket:positions:v2";
export const LEGACY_POSITION_STORAGE_KEY = "arc-basket:positions:v1";
export const POSITION_QUARANTINE_STORAGE_KEY = "arc-set:positions:quarantine:v1";
export const POSITION_UPDATED_EVENT = "arc-set:positions-updated";

export type AssetExecutionToken = "EURC" | "cirBTC" | "EARN-USDC";

export type StoredAssetExecutionLeg = {
  name: string;
  outputToken: AssetExecutionToken;
  operation?: "buy" | "sell";
  amountInUsdc: string;
  outputAmount: string | null;
  outputAmountSource: "actual" | "estimated";
  transactionHash: `0x${string}`;
  status: "complete" | "pending" | "failed";
};

export type StoredBasketPosition = {
  schemaVersion: 2;
  id: string;
  walletAddress: `0x${string}`;
  basketSlug: string;
  basketVersion: number;
  chainId: number;
  investedUsdc: string;
  retainedUsdc: string;
  status: "complete" | "partial" | "pending" | "failed";
  legs: StoredAssetExecutionLeg[];
  createdAt: number;
};

export type AggregatedAssetOutput = {
  token: AssetExecutionToken;
  amount: string;
  estimated: boolean;
};

export type AggregatedBasketPosition = {
  basketSlug: string;
  investedUsdc: string;
  retainedUsdc: string;
  outputs: AggregatedAssetOutput[];
  executionCount: number;
  transactionCount: number;
  latestTransactionHash: `0x${string}`;
  latestCreatedAt: number;
  status: "complete" | "partial" | "pending" | "failed";
};

type LegacyStoredBasketPosition = {
  id: string;
  walletAddress: `0x${string}`;
  basketSlug: string;
  basketVersion: number;
  chainId: number;
  txHash: `0x${string}`;
  investedUsdc: string;
  retainedUsdc: string;
  outputToken: "EURC";
  outputAmount: string | null;
  outputAmountSource: "actual" | "estimated";
  status: "complete" | "pending";
  createdAt: number;
};

function isHexAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isTransactionHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
}

function isSignedDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
}

function isStoredAssetExecutionLeg(value: unknown): value is StoredAssetExecutionLeg {
  if (!value || typeof value !== "object") return false;
  const leg = value as Record<string, unknown>;
  return (
    typeof leg.name === "string" &&
    (leg.outputToken === "EURC" || leg.outputToken === "cirBTC" || leg.outputToken === "EARN-USDC") &&
    (leg.operation === undefined || leg.operation === "buy" || leg.operation === "sell") &&
    isDecimalString(leg.amountInUsdc) &&
    (leg.outputAmount === null || isDecimalString(leg.outputAmount)) &&
    (leg.outputAmountSource === "actual" || leg.outputAmountSource === "estimated") &&
    isTransactionHash(leg.transactionHash) &&
    (leg.status === "complete" || leg.status === "pending" || leg.status === "failed")
  );
}

export function isStoredBasketPosition(value: unknown): value is StoredBasketPosition {
  if (!value || typeof value !== "object") return false;
  const position = value as Record<string, unknown>;
  return (
    position.schemaVersion === 2 &&
    typeof position.id === "string" &&
    isHexAddress(position.walletAddress) &&
    typeof position.basketSlug === "string" &&
    Number.isInteger(position.basketVersion) &&
    position.chainId === ARC_TESTNET.id &&
    isDecimalString(position.investedUsdc) &&
    isSignedDecimalString(position.retainedUsdc) &&
    (position.status === "complete" || position.status === "partial" || position.status === "pending" || position.status === "failed") &&
    Array.isArray(position.legs) &&
    position.legs.length > 0 &&
    position.legs.every(isStoredAssetExecutionLeg) &&
    typeof position.createdAt === "number" && Number.isFinite(position.createdAt)
  );
}

function isLegacyStoredBasketPosition(value: unknown): value is LegacyStoredBasketPosition {
  if (!value || typeof value !== "object") return false;
  const position = value as Record<string, unknown>;
  return (
    typeof position.id === "string" &&
    isHexAddress(position.walletAddress) &&
    typeof position.basketSlug === "string" &&
    Number.isInteger(position.basketVersion) &&
    position.chainId === ARC_TESTNET.id &&
    isTransactionHash(position.txHash) &&
    isDecimalString(position.investedUsdc) &&
    isDecimalString(position.retainedUsdc) &&
    position.outputToken === "EURC" &&
    (position.outputAmount === null || isDecimalString(position.outputAmount)) &&
    (position.outputAmountSource === "actual" || position.outputAmountSource === "estimated") &&
    (position.status === "complete" || position.status === "pending") &&
    typeof position.createdAt === "number" && Number.isFinite(position.createdAt)
  );
}

function subtractDecimalStrings(total: string, retained: string) {
  const amount = parseUnits(total, 6) - parseUnits(retained, 6);
  return formatUnits(amount > 0n ? amount : 0n, 6);
}

function addDecimalStrings(left: string, right: string, decimals: number) {
  return formatUnits(parseUnits(left, decimals) + parseUnits(right, decimals), decimals);
}

function signedAssetAmount(leg: StoredAssetExecutionLeg) {
  const amount = leg.outputAmount ?? "0";
  return leg.operation === "sell" && amount !== "0" ? `-${amount}` : amount;
}

function outputDecimals(token: AssetExecutionToken) {
  return token === "cirBTC" ? 8 : 6;
}

function migrateLegacyPosition(position: LegacyStoredBasketPosition): StoredBasketPosition {
  return {
    schemaVersion: 2,
    id: position.id,
    walletAddress: position.walletAddress,
    basketSlug: position.basketSlug,
    basketVersion: position.basketVersion,
    chainId: position.chainId,
    investedUsdc: position.investedUsdc,
    retainedUsdc: position.retainedUsdc,
    status: position.status,
    legs: [{
      name: "Euro Coin",
      outputToken: "EURC",
      amountInUsdc: subtractDecimalStrings(position.investedUsdc, position.retainedUsdc),
      outputAmount: position.outputAmount,
      outputAmountSource: position.outputAmountSource,
      transactionHash: position.txHash,
      status: position.status,
    }],
    createdAt: position.createdAt,
  };
}

export function parseStoredPositions(serialized: string | null): StoredBasketPosition[] {
  if (!serialized) return [];
  const value: unknown = JSON.parse(serialized);
  if (!Array.isArray(value)) throw new TypeError("Saved position data is invalid.");
  if (value.every(isStoredBasketPosition)) return value;
  if (value.every(isLegacyStoredBasketPosition)) return value.map(migrateLegacyPosition);
  throw new TypeError("Saved position data is invalid.");
}

export function recoverStoredPositions(serialized: string | null) {
  if (!serialized) return { positions: [] as StoredBasketPosition[], invalidCount: 0, recovered: false };
  try {
    return { positions: parseStoredPositions(serialized), invalidCount: 0, recovered: false };
  } catch {
    try {
      const value: unknown = JSON.parse(serialized);
      if (!Array.isArray(value)) {
        return { positions: [] as StoredBasketPosition[], invalidCount: 1, recovered: true };
      }
      const positions: StoredBasketPosition[] = [];
      let invalidCount = 0;
      for (const item of value) {
        if (isStoredBasketPosition(item)) positions.push(item);
        else if (isLegacyStoredBasketPosition(item)) positions.push(migrateLegacyPosition(item));
        else invalidCount += 1;
      }
      return { positions, invalidCount, recovered: true };
    } catch {
      return { positions: [] as StoredBasketPosition[], invalidCount: 1, recovered: true };
    }
  }
}

function quarantineInvalidPositionData(sourceKey: string, serialized: string) {
  if (typeof window === "undefined") return;
  try {
    const existingRaw = window.localStorage.getItem(POSITION_QUARANTINE_STORAGE_KEY);
    const existing: unknown = existingRaw ? JSON.parse(existingRaw) : [];
    const entries = Array.isArray(existing) ? existing.slice(0, 4) : [];
    window.localStorage.setItem(POSITION_QUARANTINE_STORAGE_KEY, JSON.stringify([
      { sourceKey, serialized, quarantinedAt: Date.now() },
      ...entries,
    ]));
  } catch {
    // A backup must never prevent a confirmed onchain action from being recorded.
  }
}

function readAndRecoverPositionData(sourceKey: string, serialized: string) {
  const result = recoverStoredPositions(serialized);
  if (result.recovered) {
    quarantineInvalidPositionData(sourceKey, serialized);
    try {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(result.positions));
    } catch {
      // Return the in-memory recovery even when the browser storage quota is unavailable.
    }
  }
  return result.positions;
}

export function readStoredPositions() {
  if (typeof window === "undefined") return [];
  const current = window.localStorage.getItem(POSITION_STORAGE_KEY);
  if (current) return readAndRecoverPositionData(POSITION_STORAGE_KEY, current);

  const previous = window.localStorage.getItem(PREVIOUS_POSITION_STORAGE_KEY);
  if (previous) {
    const migrated = readAndRecoverPositionData(PREVIOUS_POSITION_STORAGE_KEY, previous);
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  }

  const legacy = window.localStorage.getItem(LEGACY_POSITION_STORAGE_KEY);
  const migrated = legacy ? readAndRecoverPositionData(LEGACY_POSITION_STORAGE_KEY, legacy) : [];
  if (legacy) window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(migrated));
  return migrated;
}

export function recordBasketPosition(position: StoredBasketPosition) {
  if (typeof window === "undefined") return;
  const current = readStoredPositions();
  const transactionHashes = new Set(position.legs.map((leg) => leg.transactionHash.toLowerCase()));
  const withoutDuplicate = current.filter((item) => (
    item.id !== position.id &&
    !item.legs.some((leg) => transactionHashes.has(leg.transactionHash.toLowerCase()))
  ));
  try {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify([position, ...withoutDuplicate]));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(POSITION_UPDATED_EVENT));
}

export function replaceStoredPositions(positions: StoredBasketPosition[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(positions));
  window.dispatchEvent(new Event(POSITION_UPDATED_EVENT));
}

export type TransactionResolution = "pending" | "confirmed" | "reverted";

export function positionStatusFromLegs(legs: StoredAssetExecutionLeg[]): StoredBasketPosition["status"] {
  if (legs.every((leg) => leg.status === "complete")) return "complete";
  if (legs.some((leg) => leg.status === "pending")) return "pending";
  if (legs.some((leg) => leg.status === "complete")) return "partial";
  return "failed";
}

export function reconcileStoredPositions(
  positions: StoredBasketPosition[],
  resolutions: Readonly<Record<string, TransactionResolution>>,
) {
  return positions.map((position) => {
    let changed = false;
    const legs = position.legs.map((leg) => {
      if (leg.status !== "pending") return leg;
      const resolution = resolutions[leg.transactionHash.toLowerCase()];
      if (!resolution || resolution === "pending") return leg;
      changed = true;
      return { ...leg, status: resolution === "confirmed" ? "complete" as const : "failed" as const };
    });
    return changed ? { ...position, legs, status: positionStatusFromLegs(legs) } : position;
  });
}

export function clearStoredPositions() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(POSITION_STORAGE_KEY);
  window.localStorage.removeItem(PREVIOUS_POSITION_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_POSITION_STORAGE_KEY);
  window.localStorage.removeItem(POSITION_QUARANTINE_STORAGE_KEY);
  window.dispatchEvent(new Event(POSITION_UPDATED_EVENT));
}

export function positionsForWallet(positions: StoredBasketPosition[], address: string) {
  const normalizedAddress = address.toLowerCase();
  return positions.filter((position) => position.walletAddress.toLowerCase() === normalizedAddress);
}

export function aggregateBasketPositions(positions: StoredBasketPosition[]): AggregatedBasketPosition[] {
  const byBasket = new Map<string, AggregatedBasketPosition>();
  for (const position of [...positions].sort((a, b) => a.createdAt - b.createdAt)) {
    const existing = byBasket.get(position.basketSlug);
    const outputs = new Map<AssetExecutionToken, AggregatedAssetOutput>();
    for (const current of existing?.outputs ?? []) outputs.set(current.token, { ...current });
    for (const leg of position.legs) {
      if (leg.status !== "complete") continue;
      const current = outputs.get(leg.outputToken);
      outputs.set(leg.outputToken, {
        token: leg.outputToken,
        amount: addDecimalStrings(current?.amount ?? "0", signedAssetAmount(leg), outputDecimals(leg.outputToken)),
        estimated: Boolean(current?.estimated) || leg.outputAmountSource === "estimated",
      });
    }

    const latestTransactionHash = position.legs.at(-1)!.transactionHash;
    if (existing) {
      existing.investedUsdc = addDecimalStrings(existing.investedUsdc, position.investedUsdc, 6);
      existing.retainedUsdc = addDecimalStrings(existing.retainedUsdc, position.retainedUsdc, 6);
      existing.outputs = [...outputs.values()].filter((output) => Math.abs(Number(output.amount)) > 1e-12);
      existing.executionCount += 1;
      existing.transactionCount += position.legs.length;
      existing.latestTransactionHash = latestTransactionHash;
      existing.latestCreatedAt = position.createdAt;
      if (position.status === "pending" || existing.status === "pending") existing.status = "pending";
      else if (position.status === "partial" || existing.status === "partial") existing.status = "partial";
      else if (position.status === "failed" || existing.status === "failed") existing.status = "failed";
    } else {
      byBasket.set(position.basketSlug, {
        basketSlug: position.basketSlug,
        investedUsdc: position.investedUsdc,
        retainedUsdc: position.retainedUsdc,
        outputs: [...outputs.values()].filter((output) => Math.abs(Number(output.amount)) > 1e-12),
        executionCount: 1,
        transactionCount: position.legs.length,
        latestTransactionHash,
        latestCreatedAt: position.createdAt,
        status: position.status,
      });
    }
  }
  return [...byBasket.values()]
    .filter((position) => Math.abs(Number(position.retainedUsdc)) > 1e-9 || position.outputs.length > 0)
    .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
}
