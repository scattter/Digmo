import { LockHandle, LockProvider } from "./lock.js";

export class MemoryLockProvider implements LockProvider {
  private readonly lockMap = new Map<string, number>();

  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    const now = Date.now();
    const existingExpiry = this.lockMap.get(key);

    if (existingExpiry && existingExpiry > now) {
      return null;
    }

    this.lockMap.set(key, now + ttlMs);

    return {
      release: async () => {
        const latest = this.lockMap.get(key);
        if (latest && latest <= now + ttlMs) {
          this.lockMap.delete(key);
        }
      }
    };
  }
}
