import { Cache } from "./cache.js";

interface CacheValue {
  value: unknown;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 2000;

export class MemoryCache implements Cache {
  private readonly map = new Map<string, CacheValue>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.map.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    const now = Date.now();
    for (const [cachedKey, entry] of this.map) {
      if (now >= entry.expiresAt) {
        this.map.delete(cachedKey);
      }
    }

    this.map.delete(key);
    this.map.set(key, {
      value,
      expiresAt: now + ttlSec * 1000
    });
    if (this.map.size > MAX_CACHE_ENTRIES) {
      this.map.delete(this.map.keys().next().value!);
    }
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
}
