import { describe, expect, it } from "vitest";
import { crossChainPositionsForWallet, parseCrossChainPositions, type CrossChainBasketPosition } from "./cross-chain-positions";

const hash = `0x${"a".repeat(64)}` as `0x${string}`;
const position: CrossChainBasketPosition = {
  schemaVersion: 1,
  id: "preview:1",
  walletAddress: "0x1111111111111111111111111111111111111111",
  basketSlug: "cross-chain-liquidity-preview",
  basketVersion: 1,
  investedUsdc: "10",
  retainedUsdc: "2",
  morphoUsdc: "6",
  baseUsdc: "2",
  morphoTransactionHash: hash,
  bridgeTransactionHashes: [hash],
  swapTransactionHash: hash,
  mintTransactionHash: hash,
  tokenId: "7",
  liquidity: "100",
  depositedUsdc: "0.99",
  depositedWeth: "0.0004",
  residualUsdc: "0.01",
  residualWeth: "0.00001",
  status: "active",
  createdAt: 1,
};

describe("cross-chain position storage", () => {
  it("validates persisted position metadata", () => {
    expect(parseCrossChainPositions(JSON.stringify([position]))).toEqual([position]);
    expect(() => parseCrossChainPositions('[{"schemaVersion":1}]')).toThrow(/invalid/);
  });

  it("matches wallets without case sensitivity", () => {
    expect(crossChainPositionsForWallet([position], position.walletAddress.toUpperCase())).toEqual([position]);
  });
});
