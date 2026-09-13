import { afterEach, describe, expect, it, vi } from "vitest";
import type { EIP1193Provider } from "viem";
import { createRoute, readRoute } from "./cross-chain-route";
import { executeEntryRoute, executeExitRoute, type EntryPlan, type ExitPlan, type RouteClients } from "./cross-chain-route-execution";

vi.mock("./arc-earn-client", () => ({ executeArcEarnQuote: vi.fn(), quoteArcEarnDeposit: vi.fn() }));
vi.mock("./base-uniswap-client", () => ({ executeBaseUniswapSwap: vi.fn(), mintBaseWideRangePosition: vi.fn(), quoteBaseUniswapSwap: vi.fn(), readBaseWalletPreflight: vi.fn(), removeBaseWideRangePosition: vi.fn() }));
vi.mock("./cctp-client", () => ({ executeCctpBridge: vi.fn(), quoteCctpBridge: vi.fn(), retryCctpBridge: vi.fn(), bridgeTransactionSteps: (result: { steps: unknown[] }) => result.steps }));
vi.mock("./cross-chain-positions", () => ({ saveCrossChainPosition: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const values = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, callback: (lock: object) => Promise<unknown>) => callback({}) } });
  let address = "arc";
  const wallet = {
    provider: async () => ({ request: async () => [address] }) as unknown as EIP1193Provider,
    switchToArc: vi.fn(async () => { address = "arc"; }),
    switchToBase: vi.fn(async () => { address = "base"; }),
  };
  const quote = { amountReceived: "2", feeTotal: "0", totalDebit: "2" };
  const deps = {
    quoteArcEarnDeposit: vi.fn(async () => ({})), executeArcEarnQuote: vi.fn(async () => ({ txHash: "earn" })),
    quoteCctpBridge: vi.fn(async () => quote), executeCctpBridge: vi.fn(async () => ({ state: "success", amount: "2", steps: [] })),
    retryCctpBridge: vi.fn(async () => ({ state: "success", amount: "2", steps: [] })),
    readBaseWalletPreflight: vi.fn().mockResolvedValueOnce({ usdc: "5" }).mockResolvedValue({ usdc: "8" }),
    quoteBaseUniswapSwap: vi.fn(async () => ({})), executeBaseUniswapSwap: vi.fn(async () => ({ amountOut: "0.001", swapHash: "swap" })),
    mintBaseWideRangePosition: vi.fn(async () => ({ tokenId: "1", mintHash: "mint", liquidity: "10", amountUsdc: "1", amountWeth: "0.001" })),
    removeBaseWideRangePosition: vi.fn(async () => ({ usdcAmount: "2", wethAmount: "0", hashes: ["remove"] })),
    saveCrossChainPosition: vi.fn(),
  };
  const plan = { total: "10", morpho: "6", base: "2", retained: "2", baseStartingUsdc: "0", basketVersion: 1, bridge: quote } as EntryPlan;
  return { wallet, deps, clients: deps as unknown as RouteClients, plan };
}

describe("cross-chain execution recovery", () => {
  it("caps the Base sleeve at the bridge receipt and retries position persistence without more transactions", async () => {
    const { wallet, deps, clients, plan } = setup();
    deps.saveCrossChainPosition.mockImplementationOnce(() => { throw new Error("storage unavailable"); });
    const record = createRoute("arc", "base", "entry", plan);
    await expect(executeEntryRoute(record, wallet, () => {}, clients)).rejects.toThrow("storage unavailable");
    const restored = readRoute<EntryPlan>("arc", "base", "entry")!;
    expect(restored.complete).toBe(false);
    expect(restored.results.received).toBe("2");
    await executeEntryRoute(restored, wallet, () => {}, clients);
    expect(deps.executeArcEarnQuote).toHaveBeenCalledTimes(1);
    expect(deps.executeCctpBridge).toHaveBeenCalledTimes(1);
    expect(deps.executeBaseUniswapSwap).toHaveBeenCalledTimes(1);
    expect(deps.mintBaseWideRangePosition).toHaveBeenCalledTimes(1);
    expect(deps.quoteBaseUniswapSwap).toHaveBeenCalledWith("1");
    expect(readRoute("arc", "base", "entry")?.complete).toBe(true);
  });

  it("resumes Circle's durable partial result without burning again", async () => {
    const { wallet, deps, clients, plan } = setup();
    deps.executeCctpBridge.mockResolvedValueOnce({ state: "pending", amount: "2", steps: [] });
    deps.retryCctpBridge.mockResolvedValueOnce({ state: "pending", amount: "2", steps: [] });
    const record = createRoute("arc", "base", "entry", plan);
    await expect(executeEntryRoute(record, wallet, () => {}, clients)).rejects.toThrow("CCTP paused");
    await executeEntryRoute(readRoute<EntryPlan>("arc", "base", "entry")!, wallet, () => {}, clients);
    expect(deps.executeCctpBridge).toHaveBeenCalledTimes(1);
    expect(deps.retryCctpBridge).toHaveBeenCalledTimes(2);
    expect(deps.executeArcEarnQuote).toHaveBeenCalledTimes(1);
  });

  it("retries bridge quote failure after reload without repeating Morpho", async () => {
    const { wallet, deps, clients, plan } = setup();
    deps.quoteCctpBridge.mockRejectedValueOnce(new Error("quote offline"));
    const record = createRoute("arc", "base", "entry", plan);
    await expect(executeEntryRoute(record, wallet, () => {}, clients)).rejects.toThrow("quote offline");
    expect(readRoute("arc", "base", "entry")?.pending).toBeUndefined();
    deps.readBaseWalletPreflight.mockResolvedValueOnce({ usdc: "5" });
    await executeEntryRoute(readRoute<EntryPlan>("arc", "base", "entry")!, wallet, () => {}, clients);
    expect(deps.executeArcEarnQuote).toHaveBeenCalledTimes(1);
    expect(deps.executeCctpBridge).toHaveBeenCalledTimes(1);
  });

  it("blocks execution when the provider account differs from the saved route", async () => {
    const { wallet, deps, clients, plan } = setup();
    wallet.provider = async () => ({ request: async () => ["other-wallet"] }) as unknown as EIP1193Provider;
    await expect(executeEntryRoute(createRoute("arc", "base", "entry", plan), wallet, () => {}, clients)).rejects.toThrow("connected wallet changed");
    expect(deps.executeArcEarnQuote).not.toHaveBeenCalled();
    expect(readRoute("arc", "base", "entry")?.pending).toBeUndefined();
  });

  it("does not repeat a swap whose submission outcome is unknown after reload", async () => {
    const { wallet, deps, clients, plan } = setup();
    deps.executeBaseUniswapSwap.mockRejectedValueOnce(new Error("receipt timeout"));
    await expect(executeEntryRoute(createRoute("arc", "base", "entry", plan), wallet, () => {}, clients)).rejects.toThrow("receipt timeout");
    await expect(executeEntryRoute(readRoute<EntryPlan>("arc", "base", "entry")!, wallet, () => {}, clients)).rejects.toThrow("unknown outcome");
    expect(deps.executeBaseUniswapSwap).toHaveBeenCalledTimes(1);
    expect(deps.executeCctpBridge).toHaveBeenCalledTimes(1);
    expect(deps.mintBaseWideRangePosition).not.toHaveBeenCalled();
  });

  it("does not repeat LP removal when return bridge preflight fails", async () => {
    const { wallet, deps, clients } = setup();
    const plan = { position: { tokenId: "1", residualUsdc: "0", residualWeth: "0" }, quote: {} } as ExitPlan;
    deps.quoteCctpBridge.mockRejectedValueOnce(new Error("quote offline"));
    const record = createRoute("arc", "base", "exit:1", plan);
    await expect(executeExitRoute(record, wallet, clients)).rejects.toThrow("quote offline");
    await executeExitRoute(readRoute<ExitPlan>("arc", "base", "exit:1")!, wallet, clients);
    expect(deps.removeBaseWideRangePosition).toHaveBeenCalledTimes(1);
    expect(deps.executeBaseUniswapSwap).not.toHaveBeenCalled();
    expect(deps.executeCctpBridge).toHaveBeenCalledTimes(1);
    expect(deps.saveCrossChainPosition).toHaveBeenCalledWith(expect.objectContaining({ status: "exited" }));
  });
});
