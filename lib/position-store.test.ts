import { afterEach, describe, expect, it, vi } from "vitest";
import { browserPositionStorage, createPositionStore, PositionStorageError, type PositionStorageAdapter } from "./position-store";
import { POSITION_STORAGE_KEY, readStoredPositions, recordBasketPosition, reconcilePositionReceipts, type StoredBasketPosition } from "./positions";
import { CROSS_CHAIN_POSITION_STORAGE_KEY, CROSS_CHAIN_POSITION_QUARANTINE_STORAGE_KEY, readCrossChainPositions } from "./cross-chain-positions";
import { ARC_TESTNET } from "./arc";

class MemoryStorage implements PositionStorageAdapter {
  values = new Map<string, string>();
  events = new EventTarget();
  failReads = false;
  failWrites = false;
  getItem(key: string) { if (this.failReads) throw new Error("denied"); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error("quota"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  notify(event: string) { this.events.dispatchEvent(new Event(event)); }
  subscribe(events: string[], listener: () => void) {
    events.forEach((event) => this.events.addEventListener(event, listener));
    return () => events.forEach((event) => this.events.removeEventListener(event, listener));
  }
}

function store(storage: MemoryStorage) {
  return createPositionStore<number>({ key: "current", previousKeys: ["old"], quarantineKey: "quarantine", event: "updated", recover(raw) {
    try {
      const parsed: unknown = JSON.parse(raw ?? "[]");
      if (!Array.isArray(parsed)) throw new Error("invalid");
      const positions = parsed.filter((item): item is number => typeof item === "number");
      return { positions, recovered: positions.length !== parsed.length, invalidCount: parsed.length - positions.length };
    } catch { return { positions: [], recovered: true, invalidCount: 1 }; }
  } }, () => storage);
}

const positionFixture: StoredBasketPosition = {
      schemaVersion: 2, id: "one", walletAddress: `0x${"1".repeat(40)}`, basketSlug: "arc-balanced", basketVersion: 1,
      chainId: ARC_TESTNET.id, investedUsdc: "10", retainedUsdc: "1", status: "pending", createdAt: 1,
      legs: [{ name: "swap", outputToken: "EURC", amountInUsdc: "9", outputAmount: "9", outputAmountSource: "estimated", transactionHash: `0x${"a".repeat(64)}`, status: "pending" }],
    };

afterEach(() => vi.unstubAllGlobals());

describe("position store persistence seam", () => {
  it("recovers individual entries, quarantines originals, and migrates old keys", () => {
    const storage = new MemoryStorage();
    storage.values.set("old", '[1,"bad",2]');
    expect(store(storage).read()).toEqual([1, 2]);
    expect(storage.values.get("current")).toBe("[1,2]");
    expect(JSON.parse(storage.values.get("quarantine")!)[0].serialized).toBe('[1,"bad",2]');
  });

  it("returns recoverable records and preserves originals when quarantine cannot be saved", () => {
    const storage = new MemoryStorage();
    storage.values.set("current", '[1,"bad"]');
    storage.failWrites = true;
    expect(store(storage).read()).toEqual([1]);
    expect(storage.values.get("current")).toBe('[1,"bad"]');
  });

  it("reports failed persistence with attempted records and emits no successful update", () => {
    const storage = new MemoryStorage();
    const listener = vi.fn();
    storage.subscribe(["updated"], listener);
    storage.failWrites = true;
    try { store(storage).write([42]); throw new Error("should throw"); } catch (error) {
      expect(error).toBeInstanceOf(PositionStorageError);
      expect((error as PositionStorageError).records).toEqual([42]);
    }
    expect(listener).not.toHaveBeenCalled();
  });

  it("never overwrites records when a read is denied", () => {
    const storage = new MemoryStorage();
    storage.values.set("current", "[1]");
    storage.failReads = true;
    expect(() => store(storage).update(() => [2])).toThrow(PositionStorageError);
    expect(storage.values.get("current")).toBe("[1]");
  });

  it("browser adapter subscribes to same-tab and cross-tab changes and cleans up", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", Object.assign(target, { localStorage: new MemoryStorage() }));
    const adapter = browserPositionStorage();
    const listener = vi.fn();
    const stop = adapter.subscribe(["updated"], listener);
    adapter.notify("updated");
    target.dispatchEvent(new Event("storage"));
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    adapter.notify("updated");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("quarantines corrupt cross-chain data without hiding Arc records", () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: storage }));
    storage.values.set(POSITION_STORAGE_KEY, JSON.stringify([positionFixture]));
    storage.values.set(CROSS_CHAIN_POSITION_STORAGE_KEY, "broken-json");
    expect(readCrossChainPositions()).toEqual([]);
    expect(readStoredPositions()).toEqual([positionFixture]);
    expect(storage.values.get(POSITION_STORAGE_KEY)).toBe(JSON.stringify([positionFixture]));
    expect(JSON.parse(storage.values.get(CROSS_CHAIN_POSITION_QUARANTINE_STORAGE_KEY)!)[0].serialized).toBe("broken-json");
  });

  it("receipt reconciliation merges latest records after another execution is saved", () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: storage }));
    const position = positionFixture;
    recordBasketPosition(position);
    const snapshot = readStoredPositions();
    const newer = { ...position, id: "two", legs: [{ ...position.legs[0], transactionHash: `0x${"b".repeat(64)}` as `0x${string}` }] };
    recordBasketPosition(newer);
    reconcilePositionReceipts({ [snapshot[0].legs[0].transactionHash]: "confirmed" });
    const latest = JSON.parse(storage.getItem(POSITION_STORAGE_KEY)!);
    expect(latest).toHaveLength(2);
    expect(latest.find((item: StoredBasketPosition) => item.id === "one").status).toBe("complete");
    expect(latest.find((item: StoredBasketPosition) => item.id === "two").status).toBe("pending");
  });
});
