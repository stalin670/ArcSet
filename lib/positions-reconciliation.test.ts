import { describe, expect, it } from "vitest";
import { reconcileStoredPositions, type StoredBasketPosition } from "./positions";
import { ARC_TESTNET } from "./arc";

const hashA = `0x${"a".repeat(64)}` as `0x${string}`;
const hashB = `0x${"b".repeat(64)}` as `0x${string}`;

function position(): StoredBasketPosition {
  return {
    schemaVersion: 2,
    id: "test",
    walletAddress: `0x${"1".repeat(40)}`,
    basketSlug: "arc-balanced",
    basketVersion: 1,
    chainId: ARC_TESTNET.id,
    investedUsdc: "10",
    retainedUsdc: "1",
    status: "pending",
    createdAt: 1,
    legs: [
      { name: "swap", outputToken: "EURC", amountInUsdc: "2", outputAmount: "2", outputAmountSource: "estimated", transactionHash: hashA, status: "pending" },
      { name: "earn", outputToken: "EARN-USDC", amountInUsdc: "3", outputAmount: "3", outputAmountSource: "actual", transactionHash: hashB, status: "pending" },
    ],
  };
}

describe("reconcileStoredPositions", () => {
  it("promotes all confirmed receipts to a complete position", () => {
    const [result] = reconcileStoredPositions([position()], { [hashA]: "confirmed", [hashB]: "confirmed" });
    expect(result.status).toBe("complete");
    expect(result.legs.every((leg) => leg.status === "complete")).toBe(true);
  });

  it("marks a mixed confirmed and reverted execution as partial", () => {
    const [result] = reconcileStoredPositions([position()], { [hashA]: "confirmed", [hashB]: "reverted" });
    expect(result.status).toBe("partial");
    expect(result.legs.map((leg) => leg.status)).toEqual(["complete", "failed"]);
  });
});
