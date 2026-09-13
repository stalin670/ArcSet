/** Durable execution journal. An interrupted submission is never assumed safe to repeat. */
export type RouteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type RouteRecord<P> = {
  version: 1;
  wallet: string;
  baseWallet: string;
  route: string;
  plan: P;
  results: Record<string, unknown>;
  pending?: string;
  complete: boolean;
};

// Last verified durable snapshot, separate from newer in-memory results after a failed write.
const snapshots = new WeakMap<object, string>();

export class RouteRecoveryRequired extends Error {
  constructor(step: string) {
    super(`The ${step} submission has an unknown outcome. Check the wallet transaction history before continuing; it will not be submitted again automatically.`);
    this.name = "RouteRecoveryRequired";
  }
}

function key(wallet: string, route: string) {
  return `arcset:route:v1:${wallet.toLowerCase()}:${encodeURIComponent(route)}`;
}

function encode(value: unknown) {
  return JSON.stringify(value, (_, item) => typeof item === "bigint" ? { __routeBigInt: item.toString() } : item);
}

export function readRoute<P>(wallet: string, baseWallet: string, route: string, storage: RouteStorage = window.localStorage): RouteRecord<P> | null {
  const raw = storage.getItem(key(wallet, route));
  if (!raw) return null;
  let item: RouteRecord<P>;
  try {
    item = JSON.parse(raw, (_, value) => value && typeof value === "object" && Object.keys(value).length === 1 && typeof value.__routeBigInt === "string" ? BigInt(value.__routeBigInt) : value);
    if (item.version !== 1 || item.wallet !== wallet.toLowerCase() || item.baseWallet !== baseWallet.toLowerCase() || item.route !== route || !item.plan || !item.results || typeof item.results !== "object" || Array.isArray(item.results) || typeof item.complete !== "boolean" || (item.pending !== undefined && typeof item.pending !== "string")) throw new Error();
  } catch {
    throw new Error("Saved route recovery data is invalid or belongs to a different wallet. It was preserved; check your transaction history before starting another route.");
  }
  snapshots.set(item, raw);
  return item;
}

export function createRoute<P>(wallet: string, baseWallet: string, route: string, plan: P, storage: RouteStorage = window.localStorage): RouteRecord<P> {
  const existing = readRoute<P>(wallet, baseWallet, route, storage);
  if (existing && !existing.complete) return existing;
  const record: RouteRecord<P> = { version: 1, wallet: wallet.toLowerCase(), baseWallet: baseWallet.toLowerCase(), route, plan, results: {}, complete: false };
  persist(record, storage);
  return record;
}

function persist<P>(record: RouteRecord<P>, storage: RouteStorage) {
  try {
    const serialized = encode(record);
    storage.setItem(key(record.wallet, record.route), serialized);
    if (storage.getItem(key(record.wallet, record.route)) !== serialized) throw new Error();
    snapshots.set(record, serialized);
  } catch {
    throw new Error("Route recovery could not be saved. Execution is paused. Keep this page open and restore browser storage before retrying.");
  }
}

/** Reject stale tabs before allowing them to overwrite a newer checkpoint. */
export function assertRouteCurrent<P>(record: RouteRecord<P>, storage: RouteStorage = window.localStorage) {
  const raw = storage.getItem(key(record.wallet, record.route));
  if (!raw) throw new Error("The route recovery record is missing. Reload before continuing.");
  if (raw !== (snapshots.get(record) ?? encode(record))) {
    throw new Error("Route progress changed in another tab. Reload to recover the latest checkpoint.");
  }
}

/** Call inside a wallet-scoped execution lock; completed results survive reloads. */
export function routeJournal<P>(record: RouteRecord<P>, storage: RouteStorage = window.localStorage) {
  async function preparedStep<Q, T>(name: string, prepare: () => Promise<Q>, submit: (quote: Q) => Promise<T>): Promise<T> {
    if (Object.hasOwn(record.results, name)) {
      // Repair an earlier failed result write before allowing any more transactions.
      persist(record, storage);
      return record.results[name] as T;
    }
    if (record.pending) throw new RouteRecoveryRequired(record.pending);
    if (record.complete) throw new Error("This route is already complete.");
    // Read-only failures are safe to retry and must not create submission markers.
    const quote = await prepare();
    record.pending = name;
    try { persist(record, storage); }
    catch (error) { delete record.pending; throw error; }
    // A rejection may occur after approval or submission. Keep the marker even on errors.
    const result = await submit(quote);
    record.results[name] = result;
    delete record.pending;
    persist(record, storage);
    return result;
  }
  return {
    preparedStep,
    step<T>(name: string, submit: () => Promise<T>): Promise<T> {
      return preparedStep(name, async () => undefined, submit);
    },
    async finish(savePosition: () => void | Promise<void>) {
      if (record.pending) throw new RouteRecoveryRequired(record.pending);
      if (record.complete) return;
      persist(record, storage);
      await savePosition();
      record.complete = true;
      try { persist(record, storage); }
      catch (error) { record.complete = false; throw error; }
    },
    checkpoint() { persist(record, storage); },
  };
}

const active = new Set<string>();
export async function withRouteLock<T>(wallet: string, action: () => Promise<T>): Promise<T> {
  const name = `arcset:route-lock:${wallet.toLowerCase()}`;
  const run = async () => {
    if (active.has(name)) throw new Error("Another route is already executing for this wallet.");
    active.add(name);
    try { return await action(); } finally { active.delete(name); }
  };
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error("Another tab is executing a route for this wallet.");
      return run();
    });
  }
  // A browser without cross-tab locking cannot safely submit a durable route.
  if (typeof window !== "undefined") throw new Error("This browser cannot safely lock route execution. Use a browser supporting Web Locks.");
  return run();
}
