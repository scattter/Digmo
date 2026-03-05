import { Cache } from "./cache";

interface CacheValue {
  value: unknown;
  expiresAt: number;
}

export class MemoryCache implements Cache {
  private readonly map = new Map<string, CacheValue>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.map.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    this.map.set(key, {
      value,
      expiresAt: Date.now() + ttlSec * 1000
    });
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
}
