import { describe, expect, it } from "vitest";
import { ARC_TESTNET } from "./arc";
import {
  aggregateBasketPositions,
  parseStoredPositions,
  positionsForWallet,
  recoverStoredPositions,
  type StoredBasketPosition,
} from "./positions";

const first: StoredBasketPosition = {
  schemaVersion: 2,
  id: "asset-execution-a",
  walletAddress: "0x1111111111111111111111111111111111111111",
  basketSlug: "arc-triple-index",
  basketVersion: 1,
  chainId: ARC_TESTNET.id,
  investedUsdc: "10",
  retainedUsdc: "3.5",
  status: "complete",
  createdAt: 100,
  legs: [
    {
      name: "Circle Bitcoin",
      outputToken: "cirBTC",
      amountInUsdc: "5",
      outputAmount: "0.00005",
      outputAmountSource: "actual",
      transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status: "complete",
    },
    {
      name: "Euro Coin",
      outputToken: "EURC",
      amountInUsdc: "1.5",
      outputAmount: "1.41",
      outputAmountSource: "actual",
      transactionHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      status: "complete",
    },
  ],
};

describe("basket position records", () => {
  it("validates persisted records instead of trusting local storage", () => {
    expect(parseStoredPositions(JSON.stringify([first]))).toEqual([first]);
    expect(() => parseStoredPositions('{"unexpected":true}')).toThrow(/invalid/);
  });

  it("migrates valid v1 records into a single v2 EURC leg", () => {
    const legacy = {
      id: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      walletAddress: first.walletAddress,
      basketSlug: "reserve-currency-mix",
      basketVersion: 1,
      chainId: ARC_TESTNET.id,
      txHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      investedUsdc: "10",
      retainedUsdc: "6.5",
      outputToken: "EURC",
      outputAmount: "3.2",
      outputAmountSource: "actual",
      status: "complete",
      createdAt: 50,
    };
    expect(parseStoredPositions(JSON.stringify([legacy]))).toEqual([expect.objectContaining({
      schemaVersion: 2,
      status: "complete",
      legs: [expect.objectContaining({ amountInUsdc: "3.5", outputToken: "EURC" })],
    })]);
  });

  it("recovers valid entries from mixed stale browser data", () => {
    const result = recoverStoredPositions(JSON.stringify([
      first,
      { schemaVersion: 1, incomplete: true },
    ]));
    expect(result).toEqual({ positions: [first], invalidCount: 1, recovered: true });
  });

  it("recovers from malformed JSON without throwing", () => {
    expect(recoverStoredPositions("not-json")).toEqual({
      positions: [],
      invalidCount: 1,
      recovered: true,
    });
  });

  it("matches wallet addresses case-insensitively", () => {
    expect(positionsForWallet([first], first.walletAddress.toUpperCase())).toEqual([first]);
  });

  it("aggregates multi-leg executions and preserves partial status", () => {
    const second: StoredBasketPosition = {
      ...first,
      id: "asset-execution-b",
      investedUsdc: "5",
      retainedUsdc: "1.75",
      status: "partial",
      createdAt: 200,
      legs: [{
        ...first.legs[0],
        amountInUsdc: "2.5",
        outputAmount: "0.000025",
        transactionHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      }],
    };
    expect(aggregateBasketPositions([second, first])).toEqual([{
      basketSlug: "arc-triple-index",
      investedUsdc: "15",
      retainedUsdc: "5.25",
      outputs: [
        { token: "cirBTC", amount: "0.000075", estimated: false },
        { token: "EURC", amount: "1.41", estimated: false },
      ],
      executionCount: 2,
      transactionCount: 3,
      latestTransactionHash: second.legs[0].transactionHash,
      latestCreatedAt: 200,
      status: "partial",
    }]);
  });

  it("subtracts exited assets and released cash from basket attribution", () => {
    const exit: StoredBasketPosition = {
      schemaVersion: 2,
      id: "asset-exit-a",
      walletAddress: first.walletAddress,
      basketSlug: first.basketSlug,
      basketVersion: 1,
      chainId: ARC_TESTNET.id,
      investedUsdc: "0",
      retainedUsdc: "-1.75",
      status: "complete",
      createdAt: 300,
      legs: [{
        ...first.legs[0],
        operation: "sell",
        outputAmount: "0.000025",
        transactionHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      }],
    };
    const [position] = aggregateBasketPositions([first, exit]);
    expect(position.investedUsdc).toBe("10");
    expect(position.retainedUsdc).toBe("1.75");
    expect(position.outputs).toEqual([
      { token: "cirBTC", amount: "0.000025", estimated: false },
      { token: "EURC", amount: "1.41", estimated: false },
    ]);
  });
});
