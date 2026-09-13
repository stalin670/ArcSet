import { createWalletClient, custom } from "viem";
import { describe, expect, it, vi } from "vitest";
import { ARC_TESTNET } from "./arc";
import { CIRCLE_PASSKEY_USERNAME, createSponsoredCircleProvider } from "./circle-wallet";

const account = {
  getAddress: vi.fn().mockResolvedValue("0x1111111111111111111111111111111111111111"),
};

describe("Circle sponsored EIP-1193 provider", () => {
  it("uses a Circle-compatible passkey username", () => {
    expect(CIRCLE_PASSKEY_USERNAME).toMatch(/^[A-Za-z0-9_@.:+-]{5,50}$/);
  });

  it("advertises atomic calls and sponsors a submitted batch", async () => {
    const waitForUserOperationReceipt = vi.fn().mockResolvedValue({
      receipt: {
        status: "success",
        transactionHash: `0x${"2".repeat(64)}`,
      },
    });
    const sendUserOperation = vi.fn().mockResolvedValue(`0x${"1".repeat(64)}`);
    const rawReceipt = {
      blockHash: `0x${"3".repeat(64)}`,
      blockNumber: "0x1",
      cumulativeGasUsed: "0x5208",
      effectiveGasPrice: "0x1",
      from: "0x1111111111111111111111111111111111111111",
      gasUsed: "0x5208",
      logs: [],
      logsBloom: `0x${"0".repeat(512)}`,
      status: "0x1",
      to: "0x2222222222222222222222222222222222222222",
      transactionHash: `0x${"2".repeat(64)}`,
      transactionIndex: "0x0",
      type: "0x2",
    };
    const publicClient = { request: vi.fn().mockResolvedValue(rawReceipt) };
    const provider = createSponsoredCircleProvider(
      ARC_TESTNET,
      account as never,
      { account, sendUserOperation, waitForUserOperationReceipt } as never,
      publicClient as never,
    );

    await expect(provider.request({ method: "eth_accounts" } as never)).resolves.toEqual([
      "0x1111111111111111111111111111111111111111",
    ]);

    await expect(provider.request({
      method: "wallet_getCapabilities",
      params: [account],
    } as never)).resolves.toMatchObject({
      "0x4cef52": { atomic: { status: "supported" } },
    });

    const result = await provider.request({
      method: "wallet_sendCalls",
      params: [{
        chainId: "0x4cef52",
        calls: [{
          to: "0x2222222222222222222222222222222222222222",
          data: "0x1234",
          value: "0x0",
        }],
      }],
    } as never) as { id: string };

    expect(result.id).toBe(`0x${"1".repeat(64)}`);
    expect(sendUserOperation).toHaveBeenCalledWith(expect.objectContaining({
      account,
      paymaster: true,
      calls: [{
        to: "0x2222222222222222222222222222222222222222",
        data: "0x1234",
        value: 0n,
      }],
    }));

    await waitForUserOperationReceipt.mock.results[0]?.value;
    await expect(provider.request({
      method: "wallet_getCallsStatus",
      params: [result.id],
    } as never)).resolves.toMatchObject({
      status: 200,
      receipts: [{ transactionHash: `0x${"2".repeat(64)}` }],
    });

    const walletClient = createWalletClient({ chain: ARC_TESTNET, transport: custom(provider) });
    await expect(walletClient.getCallsStatus({ id: result.id as `0x${string}` })).resolves.toMatchObject({
      atomic: true,
      status: "success",
      statusCode: 200,
      receipts: [{ transactionHash: `0x${"2".repeat(64)}`, status: "success" }],
    });
  });

  it("rejects a batch for a different chain", async () => {
    const provider = createSponsoredCircleProvider(
      ARC_TESTNET,
      account as never,
      { account } as never,
      {} as never,
    );
    await expect(provider.request({
      method: "wallet_sendCalls",
      params: [{ chainId: "0x1", calls: [] }],
    } as never)).rejects.toThrow("different network");
  });
});
