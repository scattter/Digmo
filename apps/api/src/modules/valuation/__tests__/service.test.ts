import { describe, expect, test } from "vitest";
import { MemoryCache } from "../../../infra/cache/memory-cache";
import { InMemoryRepository } from "../../../infra/repo/in-memory-repository";
import { McpSeedFundDataProvider } from "../../data/mcp-seed-provider";
import { ValuationService } from "../service";

function createMockQuoteClient() {
  return {
    isEnabled: () => true,
    fetchQuoteByCode: async (code: string) => ({
      code,
      current: 10,
      percent: 1
    })
  };
}

function createMockRealtimeEstimateFetcher() {
  return async (fundCode: string) => ({
    fundCode,
    name: `基金${fundCode}`,
    officialNav: 1,
    estimateNav: 1.01,
    changePct: 0.01,
    quoteTime: new Date("2026-03-02T02:00:00.000Z").toISOString()
  });
}

function createEmptyRealtimeEstimateFetcher() {
  return async () => undefined;
}

describe("valuation service", () => {
  test("keeps idempotency within the same estimate bucket", async () => {
    const service = new ValuationService({
      provider: new McpSeedFundDataProvider(["161725"]),
      repository: new InMemoryRepository(),
      cache: new MemoryCache(),
      eastmoneyClient: createMockQuoteClient() as any,
      realtimeEstimateFetcher: createMockRealtimeEstimateFetcher()
    });

    await service.bootstrap();

    const now = new Date("2026-03-02T02:00:00.000Z");
    const first = await service.computeAndPersist("161725", {
      now,
      bucketIso: "2026-03-02T02:00:00.000Z",
      skipIfExists: true
    });

    const second = await service.computeAndPersist("161725", {
      now: new Date("2026-03-02T02:00:10.000Z"),
      bucketIso: "2026-03-02T02:00:00.000Z",
      skipIfExists: true
    });

    expect(second.estimateTime).toEqual(first.estimateTime);
  });

  test("returns partial failures for unknown fund codes in batch request", async () => {
    const service = new ValuationService({
      provider: new McpSeedFundDataProvider(["161725"]),
      repository: new InMemoryRepository(),
      cache: new MemoryCache(),
      eastmoneyClient: createMockQuoteClient() as any,
      realtimeEstimateFetcher: createMockRealtimeEstimateFetcher()
    });

    await service.bootstrap();

    const result = await service.getBatchEstimates(["161725", "999999"]);

    expect(result.data.length).toBe(1);
    expect(result.partialFailed).toContain("999999");
  });

  test("uses fundgz realtime estimate when script-style source is available", async () => {
    const service = new ValuationService({
      provider: new McpSeedFundDataProvider(["161725"]),
      repository: new InMemoryRepository(),
      cache: new MemoryCache(),
      eastmoneyClient: createMockQuoteClient() as any,
      realtimeEstimateFetcher: createMockRealtimeEstimateFetcher()
    });

    await service.bootstrap();

    const snapshot = await service.computeAndPersist("161725", {
      now: new Date("2026-03-02T02:00:00.000Z"),
      bucketIso: "2026-03-02T02:00:00.000Z",
      skipIfExists: false
    });

    expect(snapshot.method).toBe("BETA_PROXY");
    expect(snapshot.estimateChangePct).toBeCloseTo(0.01, 6);
    expect(snapshot.topHoldings.some((holding) => holding.source === "SCRIPT_MIXED")).toBe(true);
  });

  test("falls back to official NAV return when realtime estimate is unavailable", async () => {
    const service = new ValuationService({
      provider: new McpSeedFundDataProvider(["161725"]),
      repository: new InMemoryRepository(),
      cache: new MemoryCache(),
      eastmoneyClient: createMockQuoteClient() as any,
      realtimeEstimateFetcher: createEmptyRealtimeEstimateFetcher()
    });

    await service.bootstrap();

    const snapshot = await service.computeAndPersist("161725", {
      now: new Date("2026-03-03T02:00:00.000Z"),
      bucketIso: "2026-03-03T02:00:00.000Z",
      skipIfExists: false
    });

    expect(snapshot.method).toBe("INDEX_TRACKING");
    expect(snapshot.estimateNav).toBeCloseTo(snapshot.officialNav ?? 0, 6);
    expect(snapshot.estimateChangePct).toBeCloseTo(snapshot.officialDailyReturn, 6);
  });

  test("uses official NAV return when realtime estimate is zero change", async () => {
    const service = new ValuationService({
      provider: new McpSeedFundDataProvider(["161725"]),
      repository: new InMemoryRepository(),
      cache: new MemoryCache(),
      eastmoneyClient: createMockQuoteClient() as any,
      realtimeEstimateFetcher: async (fundCode: string) => ({
        fundCode,
        name: `基金${fundCode}`,
        officialNav: 1,
        estimateNav: 1,
        changePct: 0,
        quoteTime: new Date("2026-03-03T02:00:00.000Z").toISOString()
      })
    });

    await service.bootstrap();

    const snapshot = await service.computeAndPersist("161725", {
      now: new Date("2026-03-03T02:00:00.000Z"),
      bucketIso: "2026-03-03T02:00:00.000Z",
      skipIfExists: false
    });

    expect(snapshot.method).toBe("INDEX_TRACKING");
    expect(snapshot.estimateChangePct).toBeCloseTo(snapshot.officialDailyReturn, 6);
  });

  test("prefers official daily return when official NAV has updated for today", async () => {
    const service = new ValuationService({
      provider: new McpSeedFundDataProvider(["161725"]),
      repository: new InMemoryRepository(),
      cache: new MemoryCache(),
      eastmoneyClient: createMockQuoteClient() as any,
      realtimeEstimateFetcher: createMockRealtimeEstimateFetcher()
    });

    await service.bootstrap();

    const snapshot = await service.computeAndPersist("161725", {
      now: new Date("2026-02-27T06:30:00.000Z"),
      bucketIso: "2026-02-27T06:30:00.000Z",
      skipIfExists: false
    });

    expect(snapshot.method).toBe("INDEX_TRACKING");
    expect(snapshot.estimateNav).toBeCloseTo(snapshot.officialNav ?? 0, 6);
    expect(snapshot.estimateChangePct).toBeCloseTo(snapshot.officialDailyReturn, 6);
  });

  test("uses official daily return outside trading hours even if realtime estimate exists", async () => {
    const service = new ValuationService({
      provider: new McpSeedFundDataProvider(["161725"]),
      repository: new InMemoryRepository(),
      cache: new MemoryCache(),
      eastmoneyClient: createMockQuoteClient() as any,
      realtimeEstimateFetcher: createMockRealtimeEstimateFetcher()
    });

    await service.bootstrap();

    const snapshot = await service.computeAndPersist("161725", {
      now: new Date("2026-03-03T15:34:00.000Z"),
      bucketIso: "2026-03-03T15:34:00.000Z",
      skipIfExists: false
    });

    expect(snapshot.method).toBe("INDEX_TRACKING");
    expect(snapshot.estimateNav).toBeCloseTo(snapshot.officialNav ?? 0, 6);
    expect(snapshot.estimateChangePct).toBeCloseTo(snapshot.officialDailyReturn, 6);
  });
});
