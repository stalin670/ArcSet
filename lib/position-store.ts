/** Browser persistence seam shared by both position journals. */
export type PositionStorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  notify(event: string): void;
  subscribe(events: string[], listener: () => void): () => void;
};

export class PositionStorageError extends Error {
  constructor(message: string, readonly records: readonly unknown[] = [], options?: ErrorOptions) {
    super(message, options);
    this.name = "PositionStorageError";
  }
}

export function browserPositionStorage(): PositionStorageAdapter {
  if (typeof window === "undefined") throw new PositionStorageError("Browser position storage is unavailable.");
  return {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
    notify: (event) => window.dispatchEvent(new Event(event)),
    subscribe(events, listener) {
      const names = ["storage", ...events];
      names.forEach((name) => window.addEventListener(name, listener));
      return () => names.forEach((name) => window.removeEventListener(name, listener));
    },
  };
}

export function createPositionStore<T>(options: {
  key: string;
  previousKeys: string[];
  quarantineKey: string;
  event: string;
  recover: (raw: string | null) => { positions: T[]; invalidCount: number; recovered: boolean };
}, adapter: () => PositionStorageAdapter = browserPositionStorage) {
  function write(records: T[]) {
    try {
      const storage = adapter();
      storage.setItem(options.key, JSON.stringify(records));
      storage.notify(options.event);
    } catch (cause) {
      throw new PositionStorageError("Position metadata could not be saved. Keep this page open and retry saving; your submitted transactions are unchanged.", records, { cause });
    }
  }
  function read(): T[] {
    try {
      const storage = adapter();
      for (const key of [options.key, ...options.previousKeys]) {
        const raw = storage.getItem(key);
        if (raw === null) continue;
        const recovered = options.recover(raw);
        // Retain the original source until its quarantine backup is durable.
        // Recovery is read-only if storage is unavailable or full.
        try {
          if (recovered.recovered) {
            let previous: unknown = [];
            try { previous = JSON.parse(storage.getItem(options.quarantineKey) ?? "[]"); } catch { /* replace damaged backup */ }
            storage.setItem(options.quarantineKey, JSON.stringify([
              { sourceKey: key, serialized: raw, quarantinedAt: Date.now() },
              ...(Array.isArray(previous) ? previous.slice(0, 4) : []),
            ]));
          }
          if (recovered.recovered || key !== options.key) storage.setItem(options.key, JSON.stringify(recovered.positions));
        } catch { /* Valid records remain readable even when repair cannot persist. */ }
        return recovered.positions;
      }
      return [];
    } catch (cause) {
      throw new PositionStorageError("Saved position metadata could not be read. Check browser storage access and retry.", [], { cause });
    }
  }
  return {
    read,
    write,
    update(change: (latest: T[]) => T[]) {
      const current = read();
      const next = change(current);
      if (next !== current) write(next);
      return next;
    },
    clear() {
      try {
        const storage = adapter();
        [options.key, ...options.previousKeys, options.quarantineKey].forEach((key) => storage.removeItem(key));
        storage.notify(options.event);
      } catch (cause) {
        throw new PositionStorageError("Saved position metadata could not be cleared.", [], { cause });
      }
    },
  };
}

export function subscribePositionChanges(events: string[], listener: () => void) {
  return browserPositionStorage().subscribe(events, listener);
}
