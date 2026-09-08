import "server-only";
import { isHex } from "viem";
import { ARC_TESTNET } from "@/lib/arc";
import { readArcWithFallback } from "@/lib/arc-server-client";

export type ArcExecutionStatus = {
  chainId: number;
  transactionHash: `0x${string}`;
  status: "pending" | "confirmed" | "reverted";
  blockNumber: string | null;
  checkedAt: number;
};

function validateTransactionHash(hash: string): `0x${string}` {
  if (!isHex(hash, { strict: true }) || hash.length !== 66) {
    throw new TypeError("Invalid transaction hash.");
  }
  return hash;
}

export async function readArcExecutionStatus(hash: string): Promise<ArcExecutionStatus> {
  const transactionHash = validateTransactionHash(hash);
  return readArcWithFallback(async (client) => {
    const receipt = await client.request({
      method: "eth_getTransactionReceipt",
      params: [transactionHash],
    });
    const normalized = receipt as null | { blockNumber: bigint | `0x${string}`; status: "success" | "reverted" | `0x${string}` };
    if (!normalized) {
      return { chainId: ARC_TESTNET.id, transactionHash, status: "pending", blockNumber: null, checkedAt: Date.now() };
    }
    const reverted = normalized.status === "reverted" || normalized.status === "0x0";
    return {
      chainId: ARC_TESTNET.id,
      transactionHash,
      status: reverted ? "reverted" : "confirmed",
      blockNumber: BigInt(normalized.blockNumber).toString(),
      checkedAt: Date.now(),
    };
  }, { retryCount: 0 });
}
