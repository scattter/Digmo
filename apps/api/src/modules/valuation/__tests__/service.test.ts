import { describe, expect, test, vi } from "vitest";
import { MemoryCache } from "../../../infra/cache/memory-cache.js";
import { InMemoryRepository } from "../../../infra/repo/in-memory-repository.js";
import { McpSeedFundDataProvider } from "../../data/mcp-seed-provider.js";
import { ValuationService } from "../service.js";

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
  return async (fundCode: string, now: Date) => ({
    fundCode,
    name: `基金${fundCode}`,
    officialNav: 1,
    estimateNav: 1.01,
    changePct: 0.01,
    quoteTime: now.toISOString()
  });
}

function createEmptyRealtimeEstimateFetcher() {
  return async () => undefined;
}

function createEstimateSnapshot(fundCode: string) {
  return {
    fundCode,
    fundName: `基金${fundCode}`,
    officialNav: 1,
    officialDailyReturn: 0.002,
    estimateNav: 1.002,
    estimateChangePct: 0.002,
    baseNavDate: "2026-03-02",
    estimateTime: "2026-03-02T02:00:00.000Z",
    confidenceLevel: "HIGH" as const,
    confidenceScore: 90,
    method: "BETA_PROXY" as const,
    inputsStalenessSec: 1,
    topHoldings: [],
    disclaimer: "test"
  };
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

  test("sets intraday estimate to zero on trading day when realtime estimate is unavailable", async () => {
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
    expect(snapshot.estimateChangePct).toBeCloseTo(0, 6);
  });

  test("keeps realtime estimate when realtime estimate is zero change", async () => {
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

    expect(snapshot.method).toBe("BETA_PROXY");
    expect(snapshot.estimateChangePct).toBeCloseTo(0, 6);
  });

  test("uses realtime estimate on trading day even when official NAV has updated for today", async () => {
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

    expect(snapshot.method).toBe("BETA_PROXY");
    expect(snapshot.estimateChangePct).toBeCloseTo(0.01, 6);
  });

  test("uses realtime estimate outside trading hours on trading day", async () => {
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
    expect(snapshot.estimateChangePct).toBeCloseTo(0.01, 6);
  });

  test("rejects previous-trading-day realtime estimate on trading day", async () => {
    const service = new ValuationService({
      provider: new McpSeedFundDataProvider(["161725"]),
      repository: new InMemoryRepository(),
      cache: new MemoryCache(),
      eastmoneyClient: createMockQuoteClient() as any,
      realtimeEstimateFetcher: async (fundCode: string) => ({
        fundCode,
        name: `基金${fundCode}`,
        officialNav: 1,
        estimateNav: 1.01,
        changePct: 0.01,
        quoteTime: new Date("2026-03-02T08:00:00.000Z").toISOString()
      })
    });

    await service.bootstrap();

    const snapshot = await service.computeAndPersist("161725", {
      now: new Date("2026-03-03T02:00:00.000Z"),
      bucketIso: "2026-03-03T02:00:00.000Z",
      skipIfExists: false
    });

    expect(snapshot.method).toBe("INDEX_TRACKING");
    expect(snapshot.estimateChangePct).toBeCloseTo(0, 6);
  });

  test("sets intraday estimate to zero on non-trading day", async () => {
    const service = new ValuationService({
      provider: new McpSeedFundDataProvider(["161725"]),
      repository: new InMemoryRepository(),
      cache: new MemoryCache(),
      eastmoneyClient: createMockQuoteClient() as any,
      realtimeEstimateFetcher: createMockRealtimeEstimateFetcher()
    });

    await service.bootstrap();

    const snapshot = await service.computeAndPersist("161725", {
      now: new Date("2026-03-01T02:00:00.000Z"),
      bucketIso: "2026-03-01T02:00:00.000Z",
      skipIfExists: false
    });

    expect(snapshot.method).toBe("INDEX_TRACKING");
    expect(snapshot.estimateChangePct).toBeCloseTo(0, 6);
  });

  test("refreshes official NAV after close even within the same bucket", async () => {
    vi.useFakeTimers();
    try {
      const fundCode = "999001";
      const profile = {
        fundCode,
        fundName: "测试基金",
        fundType: "混合型",
        indexCode: "000300"
      };

      let latestNav = {
        fundCode,
        navDate: "2026-03-05",
        nav: 1,
        dailyReturn: 0.0006
      };

      const provider = {
        async listTargetFundCodes() {
          return [fundCode];
        },
        async getFundProfile() {
          return profile;
        },
        async getLatestNavRecord() {
          return latestNav;
        },
        async getRecentNavRecords() {
          return [latestNav];
        },
        async getHoldingSnapshot() {
          return {
            fundCode,
            reportDate: "2026-03-05",
            stockRatio: 0,
            bondRatio: 0,
            cashRatio: 1,
            holdings: []
          };
        }
      };

      const service = new ValuationService({
        provider: provider as any,
        repository: new InMemoryRepository(),
        cache: new MemoryCache(),
        eastmoneyClient: createMockQuoteClient() as any,
        realtimeEstimateFetcher: createEmptyRealtimeEstimateFetcher()
      });

      await service.bootstrap();

      vi.setSystemTime(new Date("2026-03-06T15:10:00.000Z"));
      const first = await service.getOrComputeEstimate(fundCode);
      expect(first.baseNavDate).toBe("2026-03-05");
      expect(first.officialDailyReturn).toBeCloseTo(0.0006, 6);

      latestNav = {
        fundCode,
        navDate: "2026-03-06",
        nav: 1.0013,
        dailyReturn: 0.0013
      };

      vi.setSystemTime(new Date("2026-03-06T15:11:00.000Z"));
      const second = await service.getOrComputeEstimate(fundCode);
      expect(second.baseNavDate).toBe("2026-03-06");
      expect(second.officialDailyReturn).toBeCloseTo(0.0013, 6);
    } finally {
      vi.useRealTimers();
    }
  });

  test("fetches batch estimates concurrently", async () => {
    const service = new ValuationService({
      provider: new McpSeedFundDataProvider(["161725"]),
      repository: new InMemoryRepository(),
      cache: new MemoryCache(),
      eastmoneyClient: createMockQuoteClient() as any,
      realtimeEstimateFetcher: createMockRealtimeEstimateFetcher()
    });

    let inFlight = 0;
    let maxInFlight = 0;
    vi.spyOn(service, "getOrComputeEstimate").mockImplementation(async (fundCode: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 40));
      inFlight -= 1;
      return createEstimateSnapshot(fundCode);
    });

    const result = await service.getBatchEstimates(["161725", "110011", "006327", "009033"]);
    expect(result.data).toHaveLength(4);
    expect(result.partialFailed).toHaveLength(0);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  test("bootstrap does not fail when some target funds are unavailable", async () => {
    const availableFundCode = "161725";
    const unavailableFundCode = "999999";
    const repository = new InMemoryRepository();

    const provider = {
      async listTargetFundCodes() {
        return [availableFundCode, unavailableFundCode];
      },
      async getFundProfile(fundCode: string) {
        if (fundCode === availableFundCode) {
          return {
            fundCode,
            fundName: "可用基金",
            fundType: "指数型"
          };
        }
        return undefined;
      },
      async getLatestNavRecord(fundCode: string) {
        if (fundCode === availableFundCode) {
          return {
            fundCode,
            navDate: "2026-03-02",
            nav: 1,
            dailyReturn: 0.001
          };
        }
        return undefined;
      },
      async getRecentNavRecords(fundCode: string) {
        if (fundCode === availableFundCode) {
          return [
            {
              fundCode,
              navDate: "2026-03-02",
              nav: 1,
              dailyReturn: 0.001
            }
          ];
        }
        return [];
      },
      async getHoldingSnapshot(fundCode: string) {
        if (fundCode === availableFundCode) {
          return {
            fundCode,
            reportDate: "2026-03-02",
            stockRatio: 0.9,
            bondRatio: 0,
            cashRatio: 0.1,
            holdings: []
          };
        }
        return undefined;
      }
    };

    const service = new ValuationService({
      provider: provider as any,
      repository,
      cache: new MemoryCache(),
      eastmoneyClient: createMockQuoteClient() as any,
      realtimeEstimateFetcher: createEmptyRealtimeEstimateFetcher()
    });

    await expect(service.bootstrap()).resolves.toBeUndefined();

    const availableProfile = await repository.getFundProfile(availableFundCode);
    expect(availableProfile?.fundCode).toBe(availableFundCode);
    const unavailableProfile = await repository.getFundProfile(unavailableFundCode);
    expect(unavailableProfile).toBeUndefined();
  });
});
