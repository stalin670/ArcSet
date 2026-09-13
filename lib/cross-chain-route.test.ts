import { describe, expect, it, vi } from "vitest";
import { assertRouteCurrent, createRoute, readRoute, routeJournal, withRouteLock, type RouteStorage } from "./cross-chain-route";

function setup() {
  const values = new Map<string, string>();
  const storage: RouteStorage = { getItem: (key) => values.get(key) ?? null, setItem: vi.fn((key, value) => { values.set(key, value); }), removeItem: (key) => { values.delete(key); } };
  const record = createRoute("ARC", "BASE", "entry", { amount: 10n }, storage);
  return { storage, record, reload: () => readRoute<{ amount: bigint }>("ARC", "BASE", "entry", storage)! };
}

describe("durable cross-chain route journal", () => {
  it("round-trips bigint plans and completed steps without resubmission", async () => {
    const { storage, record, reload } = setup();
    const submit = vi.fn(async () => ({ hash: "receipt", value: 1n }));
    await routeJournal(record, storage).step("deposit", submit);
    expect(reload().plan.amount).toBe(10n);
    expect(await routeJournal(reload(), storage).step("deposit", submit)).toEqual({ hash: "receipt", value: 1n });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("blocks ambiguous errors after reload without repeating a submission", async () => {
    const { storage, record, reload } = setup();
    const submit = vi.fn(async () => { throw new Error("RPC timeout after send"); });
    await expect(routeJournal(record, storage).step("deposit", submit)).rejects.toThrow("timeout");
    await expect(routeJournal(reload(), storage).step("deposit", submit)).rejects.toThrow("unknown outcome");
    await expect(routeJournal(reload(), storage).finish(() => {})).rejects.toThrow("unknown outcome");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("allows read-only preflight failures to retry", async () => {
    const { storage, record, reload } = setup();
    const quote = vi.fn(async () => "quote").mockRejectedValueOnce(new Error("quote unavailable"));
    const submit = vi.fn(async () => "receipt");
    await expect(routeJournal(record, storage).preparedStep("bridge", quote, submit)).rejects.toThrow("quote unavailable");
    expect(reload().pending).toBeUndefined();
    await routeJournal(reload(), storage).preparedStep("bridge", quote, submit);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does not submit when storage fails before its pending marker", async () => {
    const { storage, record } = setup();
    vi.mocked(storage.setItem).mockImplementationOnce(() => { throw new Error("quota"); });
    const submit = vi.fn(async () => "receipt");
    await expect(routeJournal(record, storage).step("deposit", submit)).rejects.toThrow("could not be saved");
    expect(submit).not.toHaveBeenCalled();
  });

  it("repairs a failed result write from memory before resuming", async () => {
    const { storage, record, reload } = setup();
    const submit = vi.fn(async () => {
      vi.mocked(storage.setItem).mockImplementationOnce(() => { throw new Error("quota"); });
      return "receipt";
    });
    await expect(routeJournal(record, storage).step("deposit", submit)).rejects.toThrow("could not be saved");
    expect(reload().pending).toBe("deposit");
    expect(() => assertRouteCurrent(record, storage)).not.toThrow();
    await routeJournal(record, storage).step("deposit", submit);
    expect(reload().results.deposit).toBe("receipt");
    expect(reload().pending).toBeUndefined();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("retries position recording without repeating successful transactions", async () => {
    const { storage, record, reload } = setup();
    await routeJournal(record, storage).step("mint", async () => "NFT");
    const save = vi.fn(async () => {}).mockRejectedValueOnce(new Error("position storage unavailable"));
    await expect(routeJournal(record, storage).finish(save)).rejects.toThrow("position storage unavailable");
    expect(reload().complete).toBe(false);
    await routeJournal(reload(), storage).finish(save);
    expect(reload().complete).toBe(true);
  });

  it("rejects stale tabs and mismatched wallets without deleting data", async () => {
    const { storage, record, reload } = setup();
    const stale = reload();
    await routeJournal(record, storage).step("mint", async () => "NFT");
    expect(() => assertRouteCurrent(stale, storage)).toThrow("another tab");
    expect(() => readRoute("ARC", "OTHER", "entry", storage)).toThrow("different wallet");
    expect(reload().results.mint).toBe("NFT");
  });

  it("serializes execution for a wallet", async () => {
    let release!: () => void;
    const first = withRouteLock("ARC", () => new Promise<void>((resolve) => { release = resolve; }));
    await expect(withRouteLock("arc", async () => {})).rejects.toThrow("already executing");
    release();
    await first;
  });
});
