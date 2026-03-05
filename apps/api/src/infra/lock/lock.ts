export interface LockHandle {
  release: () => Promise<void>;
}

export interface LockProvider {
  acquire(key: string, ttlMs: number): Promise<LockHandle | null>;
}
