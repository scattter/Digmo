import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ERROR_CODES } from "@digmo/shared";
import { MemoryCache } from "../../../infra/cache/memory-cache.js";
import { InMemoryRepository } from "../../../infra/repo/in-memory-repository.js";
import { FundDataProvider } from "../../data/provider.js";
import { RealtimeFundEstimate } from "../../data/sina-fund-client.js";
import { ValuationService } from "../service.js";

function quote(fundCode = "023638", changes: Partial<RealtimeFundEstimate> = {}): RealtimeFundEstimate {
  return {
    fundCode, fundName: "测试基金", officialNav: 1.9863, officialDailyReturn: -0.01,
    estimateNav: 1.9354, estimateChangePct: -0.0257, baseNavDate: "2026-03-16",
    quoteTime: "2026-03-17T14:22:00+08:00", ...changes
  };
}

function createService(fetcher = vi.fn(async (fundCode: string): Promise<RealtimeFundEstimate | undefined> => quote(fundCode))) {
  return {
    fetcher,
    service: new ValuationService({
      provider: { listTargetFundCodes: async () => ["023638", "020273"] } as FundDataProvider,
      repository: new InMemoryRepository(),
      cache: new MemoryCache(),
      realtimeEstimateFetcher: fetcher
    })
  };
}

describe("valuation service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T06:30:00.000Z"));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  test("preserves the Sina source, baseline and source timestamp", async () => {
    const { service } = createService();
    const { quoteTime, ...expected } = quote();
    expect(await service.getOrComputeEstimate("023638")).toMatchObject({
      ...expected, estimateTime: quoteTime, confidenceLevel: "HIGH", confidenceScore: 100,
      method: "SINA_DIRECT", inputsStalenessSec: 8 * 60, topHoldings: []
    });
  });

  test.each([0, -0.0257])("preserves zero and negative returns: %s", async (change) => {
    const { service } = createService(vi.fn(async (code: string) => quote(code, { estimateChangePct: change })));
    expect((await service.getOrComputeEstimate("023638")).estimateChangePct).toBe(change);
  });

  test("deduplicates a batch and keeps unavailable funds in partialFailed", async () => {
    const { service, fetcher } = createService(vi.fn(async (code: string) => code === "023638" ? quote(code) : undefined));
    const response = await service.getBatchEstimates(["023638", "020273", "023638"]);
    expect(response.partialFailed).toEqual(["020273"]);
    expect(response.data).toHaveLength(1);
    expect(response.data[0]?.estimateChangePct).toBe(-0.0257);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("reports unavailable data explicitly instead of substituting NAV or zero", async () => {
    const { service } = createService(vi.fn(async () => undefined));
    await expect(service.getOrComputeEstimate("023638")).rejects.toMatchObject({
      code: ERROR_CODES.DATA_SOURCE_UNAVAILABLE, statusCode: 503
    });
  });

  test("shares concurrent requests for the same fund", async () => {
    const { service, fetcher } = createService(vi.fn(async (code: string) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return quote(code);
    }));
    const first = service.getOrComputeEstimate("023638");
    const second = service.getBatchEstimates(["023638"]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await first).fundCode).toBe("023638");
    expect((await second).data).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("clears failed pending requests so the next request can recover", async () => {
    const { service, fetcher } = createService();
    fetcher.mockResolvedValueOnce(undefined);
    await expect(service.getOrComputeEstimate("023638")).rejects.toMatchObject({ statusCode: 503 });
    await expect(service.getOrComputeEstimate("023638")).resolves.toMatchObject({ fundCode: "023638" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("retains previous-day quotes with their real time and low confidence", async () => {
    vi.setSystemTime(new Date("2026-03-18T02:00:00.000Z"));
    const { service } = createService();
    expect(await service.getOrComputeEstimate("023638")).toMatchObject({
      estimateTime: "2026-03-17T14:22:00+08:00", estimateChangePct: -0.0257,
      confidenceLevel: "LOW", confidenceScore: 0, inputsStalenessSec: 19 * 3600 + 38 * 60
    });
  });

  test.each(["single", "batch"])("rechecks %s cache freshness across Shanghai midnight", async (mode) => {
    vi.setSystemTime(new Date("2026-03-17T15:59:55.000Z"));
    const { service, fetcher } = createService();
    const read = async () => mode === "single" ? service.getOrComputeEstimate("023638")
      : (await service.getBatchEstimates(["023638"])).data[0];
    const before = await read();
    expect(before?.confidenceScore).toBe(100);
    vi.setSystemTime(new Date("2026-03-17T16:00:05.000Z"));
    const after = await read();
    expect(after).toMatchObject({ confidenceLevel: "LOW", confidenceScore: 0, estimateChangePct: -0.0257 });
    expect(after?.inputsStalenessSec).toBe(before!.inputsStalenessSec + 10);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("uses completion time when an uncached request crosses midnight", async () => {
    vi.setSystemTime(new Date("2026-03-17T15:59:59.000Z"));
    const { service } = createService(vi.fn(async (code: string) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return quote(code);
    }));
    const result = service.getOrComputeEstimate("023638");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toMatchObject({
      confidenceLevel: "LOW", confidenceScore: 0, inputsStalenessSec: 9 * 3600 + 38 * 60
    });
  });

  test("refreshes earlier batch results when the last request crosses midnight", async () => {
    vi.setSystemTime(new Date("2026-03-17T15:59:59.000Z"));
    const { service } = createService(vi.fn(async (code: string) => {
      if (code === "020273") await new Promise((resolve) => setTimeout(resolve, 1_000));
      return quote(code);
    }));
    const result = service.getBatchEstimates(["023638", "020273"]);
    await vi.advanceTimersByTimeAsync(1_000);
    const response = await result;
    expect(response.partialFailed).toEqual([]);
    for (const snapshot of response.data) {
      expect(snapshot).toMatchObject({
        confidenceLevel: "LOW", confidenceScore: 0, inputsStalenessSec: 9 * 3600 + 38 * 60
      });
    }
  });
});
