export const CROSS_CHAIN_POSITION_STORAGE_KEY = "arc-set:cross-chain-positions:v1";
const PREVIOUS_CROSS_CHAIN_POSITION_STORAGE_KEY = "arc-basket:cross-chain-positions:v1";
export const CROSS_CHAIN_POSITION_UPDATED_EVENT = "arc-set:cross-chain-positions-updated";

export type CrossChainPositionStatus = "active" | "exiting" | "exited" | "partial";

export type CrossChainBasketPosition = {
  schemaVersion: 1;
  id: string;
  walletAddress: `0x${string}`;
  basketSlug: "cross-chain-liquidity-preview";
  basketVersion: number;
  investedUsdc: string;
  retainedUsdc: string;
  morphoUsdc: string;
  baseUsdc: string;
  morphoTransactionHash: `0x${string}`;
  bridgeTransactionHashes: `0x${string}`[];
  swapTransactionHash: `0x${string}`;
  mintTransactionHash: `0x${string}`;
  tokenId: string;
  liquidity: string;
  depositedUsdc: string;
  depositedWeth: string;
  residualUsdc: string;
  residualWeth: string;
  status: CrossChainPositionStatus;
  createdAt: number;
  exitTransactionHashes?: `0x${string}`[];
  exitedUsdc?: string;
};

function isHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isAmount(value: unknown) {
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
}

export function isCrossChainBasketPosition(value: unknown): value is CrossChainBasketPosition {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.schemaVersion === 1 &&
    typeof item.id === "string" &&
    isAddress(item.walletAddress) &&
    item.basketSlug === "cross-chain-liquidity-preview" &&
    Number.isInteger(item.basketVersion) &&
    isAmount(item.investedUsdc) && isAmount(item.retainedUsdc) && isAmount(item.morphoUsdc) && isAmount(item.baseUsdc) &&
    isHash(item.morphoTransactionHash) &&
    Array.isArray(item.bridgeTransactionHashes) && item.bridgeTransactionHashes.every(isHash) &&
    isHash(item.swapTransactionHash) && isHash(item.mintTransactionHash) &&
    typeof item.tokenId === "string" && /^\d+$/.test(item.tokenId) &&
    typeof item.liquidity === "string" && /^\d+$/.test(item.liquidity) &&
    isAmount(item.depositedUsdc) && isAmount(item.depositedWeth) && isAmount(item.residualUsdc) && isAmount(item.residualWeth) &&
    (item.status === "active" || item.status === "exiting" || item.status === "exited" || item.status === "partial") &&
    typeof item.createdAt === "number" && Number.isFinite(item.createdAt) &&
    (item.exitTransactionHashes === undefined || (Array.isArray(item.exitTransactionHashes) && item.exitTransactionHashes.every(isHash))) &&
    (item.exitedUsdc === undefined || isAmount(item.exitedUsdc));
}

export function parseCrossChainPositions(serialized: string | null): CrossChainBasketPosition[] {
  if (!serialized) return [];
  const parsed: unknown = JSON.parse(serialized);
  if (!Array.isArray(parsed) || !parsed.every(isCrossChainBasketPosition)) throw new TypeError("Saved cross-chain position data is invalid.");
  return parsed;
}

export function readCrossChainPositions() {
  if (typeof window === "undefined") return [];
  const current = window.localStorage.getItem(CROSS_CHAIN_POSITION_STORAGE_KEY);
  if (current) return parseCrossChainPositions(current);
  const previous = window.localStorage.getItem(PREVIOUS_CROSS_CHAIN_POSITION_STORAGE_KEY);
  const migrated = parseCrossChainPositions(previous);
  if (previous) window.localStorage.setItem(CROSS_CHAIN_POSITION_STORAGE_KEY, JSON.stringify(migrated));
  return migrated;
}

export function saveCrossChainPosition(position: CrossChainBasketPosition) {
  if (typeof window === "undefined") return;
  const current = readCrossChainPositions().filter((item) => item.id !== position.id);
  window.localStorage.setItem(CROSS_CHAIN_POSITION_STORAGE_KEY, JSON.stringify([position, ...current]));
  window.dispatchEvent(new Event(CROSS_CHAIN_POSITION_UPDATED_EVENT));
}

export function removeCrossChainPosition(id: string) {
  if (typeof window === "undefined") return;
  const remaining = readCrossChainPositions().filter((position) => position.id !== id);
  window.localStorage.setItem(CROSS_CHAIN_POSITION_STORAGE_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new Event(CROSS_CHAIN_POSITION_UPDATED_EVENT));
}

export function crossChainPositionsForWallet(positions: CrossChainBasketPosition[], walletAddress: string) {
  return positions.filter((position) => position.walletAddress.toLowerCase() === walletAddress.toLowerCase());
}
