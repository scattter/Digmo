import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryCache } from "../memory-cache.js";

describe("memory cache retention", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("expires values at the TTL boundary", async () => {
    const cache = new MemoryCache();
    await cache.set("fund", { nav: 1.2 }, 10);
    vi.advanceTimersByTime(9999);
    expect(await cache.get("fund")).toEqual({ nav: 1.2 });
    vi.advanceTimersByTime(1);
    expect(await cache.get("fund")).toBeUndefined();
  });

  test("removes unread expired values before evicting a live value", async () => {
    const cache = new MemoryCache();
    await cache.set("live", "retained", 60);
    for (let index = 0; index < 1999; index += 1) {
      await cache.set(`expired-${index}`, index, 1);
    }

    vi.advanceTimersByTime(1000);
    await cache.set("new", "new", 60);

    expect(await cache.get("live")).toBe("retained");
    expect(await cache.get("new")).toBe("new");
    expect(await cache.get("expired-1998")).toBeUndefined();
  });

  test("bounds entries and keeps a recently refreshed value", async () => {
    const cache = new MemoryCache();
    for (let index = 0; index < 2000; index += 1) {
      await cache.set(String(index), index, 60);
    }
    await cache.set("0", "refreshed", 60);
    await cache.set("new", "new", 60);

    expect(await cache.get("0")).toBe("refreshed");
    expect(await cache.get("1")).toBeUndefined();
    expect(await cache.get("1999")).toBe(1999);
    expect(await cache.get("new")).toBe("new");
  });
});
