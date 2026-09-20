import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ERROR_CODES } from "@digmo/shared";
import { MemoryCache } from "../../../infra/cache/memory-cache.js";
import { InMemoryRepository } from "../../../infra/repo/in-memory-repository.js";
import { AppError } from "../../../utils/app-error.js";
import { ValuationService } from "../service.js";

function createFundGzPayload(input: {
  fundCode: string;
  name: string;
  baseNavDate: string;
  officialNav: string;
  estimateNav: string;
  estimateChangePctPercent: string;
  quoteTime: string;
}): string {
  return `jsonpgz(${JSON.stringify({
    fundcode: input.fundCode,
    name: input.name,
    jzrq: input.baseNavDate,
    dwjz: input.officialNav,
    gsz: input.estimateNav,
    gszzl: input.estimateChangePctPercent,
    gztime: input.quoteTime
  })});`;
}

function createMinimalProvider(fundCodes: string[]) {
  return {
    async listTargetFundCodes() {
      return fundCodes;
    }
  };
}

function validPayload(overrides: Record<string, unknown> = {}): string {
  return `jsonpgz(${JSON.stringify({
    fundcode: "023638",
    name: "测试基金",
    jzrq: "2026-03-16",
    dwjz: "1.9863",
    gsz: "1.9354",
    gszzl: "-2.57",
    gztime: "2026-03-17 14:22",
    ...overrides
  })});`;
}

function createService(): ValuationService {
  return new ValuationService({
    provider: createMinimalProvider(["023638"]) as any,
    repository: new InMemoryRepository(),
    cache: new MemoryCache()
  });
}

describe("valuation service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("gets 023638 directly from fundgz without provider NAV or holding dependencies", async () => {
    vi.setSystemTime(new Date("2026-03-17T06:30:00.000Z"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        createFundGzPayload({
          fundCode: "023638",
          name: "国泰A股电网设备ETF联接A",
          baseNavDate: "2026-03-16",
          officialNav: "1.9863",
          estimateNav: "1.9354",
          estimateChangePctPercent: "-2.57",
          quoteTime: "2026-03-17 14:22"
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/javascript"
          }
        }
      )
    );

    const service = new ValuationService({
      provider: createMinimalProvider(["023638"]) as any,
      repository: new InMemoryRepository(),
      cache: new MemoryCache()
    });

    const snapshot = await service.getOrComputeEstimate("023638");

    expect(snapshot).toMatchObject({
      fundCode: "023638",
      fundName: "国泰A股电网设备ETF联接A",
      officialNav: 1.9863,
      estimateNav: 1.9354,
      estimateChangePct: -0.0257,
      baseNavDate: "2026-03-16",
      estimateTime: "2026-03-17T14:22:00+08:00",
      confidenceLevel: "HIGH",
      confidenceScore: 100,
      method: "FUND_GZ_DIRECT",
      holdingReportDate: undefined,
      topHoldings: []
    });
    expect(snapshot.officialDailyReturn).toBeUndefined();
    expect(snapshot.inputsStalenessSec).toBe(8 * 60);
  });

  test("keeps negative fundgz values for 023638 and 020273 in batch response", async () => {
    vi.setSystemTime(new Date("2026-03-17T06:30:00.000Z"));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/023638.js")) {
        return new Response(
          createFundGzPayload({
            fundCode: "023638",
            name: "国泰A股电网设备ETF联接A",
            baseNavDate: "2026-03-16",
            officialNav: "1.9863",
            estimateNav: "1.9354",
            estimateChangePctPercent: "-2.57",
            quoteTime: "2026-03-17 14:22"
          }),
          { status: 200 }
        );
      }

      if (url.includes("/020273.js")) {
        return new Response(
          createFundGzPayload({
            fundCode: "020273",
            name: "富国中证细分化工产业主题ETF发起式联接A",
            baseNavDate: "2026-03-16",
            officialNav: "1.5888",
            estimateNav: "1.5550",
            estimateChangePctPercent: "-2.13",
            quoteTime: "2026-03-17 14:24"
          }),
          { status: 200 }
        );
      }

      return new Response("", { status: 404 });
    });

    const service = new ValuationService({
      provider: createMinimalProvider(["023638", "020273"]) as any,
      repository: new InMemoryRepository(),
      cache: new MemoryCache()
    });

    const response = await service.getBatchEstimates(["023638", "020273"]);

    expect(response.partialFailed).toEqual([]);
    expect(response.data).toHaveLength(2);
    expect(response.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fundCode: "023638",
          estimateChangePct: -0.0257
        }),
        expect.objectContaining({
          fundCode: "020273",
          estimateChangePct: -0.0213
        })
      ])
    );
  });

  test("returns partialFailed for invalid fundgz payloads instead of coercing to zero", async () => {
    vi.setSystemTime(new Date("2026-03-17T06:30:00.000Z"));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/023638.js")) {
        return new Response(
          createFundGzPayload({
            fundCode: "023638",
            name: "国泰A股电网设备ETF联接A",
            baseNavDate: "2026-03-16",
            officialNav: "1.9863",
            estimateNav: "1.9354",
            estimateChangePctPercent: "-2.57",
            quoteTime: "2026-03-17 14:22"
          }),
          { status: 200 }
        );
      }

      return new Response("jsonpgz({\"fundcode\":\"020273\"});", { status: 200 });
    });

    const service = new ValuationService({
      provider: createMinimalProvider(["023638", "020273"]) as any,
      repository: new InMemoryRepository(),
      cache: new MemoryCache()
    });

    const response = await service.getBatchEstimates(["023638", "020273"]);

    expect(response.data).toHaveLength(1);
    expect(response.data[0]?.fundCode).toBe("023638");
    expect(response.partialFailed).toEqual(["020273"]);
  });

  test("throws explicit unavailable error when fundgz request fails", async () => {
    vi.setSystemTime(new Date("2026-03-17T06:30:00.000Z"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));

    const service = new ValuationService({
      provider: createMinimalProvider(["023638"]) as any,
      repository: new InMemoryRepository(),
      cache: new MemoryCache()
    });

    await expect(service.getOrComputeEstimate("023638")).rejects.toMatchObject<AppError>({
      code: ERROR_CODES.DATA_SOURCE_UNAVAILABLE,
      statusCode: 503
    });
  });

  test.each([
    ["dwjz", ""],
    ["gsz", "  "],
    ["gszzl", ""],
    ["gszzl", "Infinity"],
    ["gszzl", "NaN"],
    ["dwjz", "0"],
    ["gsz", "-0"],
    ["gsz", "-1"],
    ["jzrq", "2026-02-29"],
    ["jzrq", "2026-13-01"],
    ["gztime", undefined],
    ["gztime", "not-a-time"],
    ["gztime", "2026-02-30 14:22"],
    ["gztime", "2026-03-17 24:00"],
    ["gztime", "2026-03-17 14:60"],
    ["gztime", "2026-03-17 14:22:60"]
  ])("rejects invalid %s value %s", async (field, value) => {
    vi.setSystemTime(new Date("2026-03-17T06:30:00.000Z"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(validPayload({ [field as string]: value })));

    await expect(createService().getBatchEstimates(["023638"])).resolves.toEqual({
      data: [],
      partialFailed: ["023638"]
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  test.each([["0", 0], ["-0", 0], ["-2.57", -0.0257]])("preserves valid zero and negative returns: %s", async (change, expected) => {
    vi.setSystemTime(new Date("2026-03-17T06:30:00.000Z"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(validPayload({ gszzl: change })));

    const snapshot = await createService().getOrComputeEstimate("023638");
    expect(snapshot.estimateChangePct).toBe(expected);
    expect(snapshot.confidenceLevel).toBe("HIGH");
  });

  test("retains previous-day quotes with their real time and low confidence", async () => {
    vi.setSystemTime(new Date("2026-03-18T02:00:00.000Z"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(validPayload()));

    const snapshot = await createService().getOrComputeEstimate("023638");
    expect(snapshot).toMatchObject({
      estimateTime: "2026-03-17T14:22:00+08:00",
      estimateChangePct: -0.0257,
      confidenceLevel: "LOW",
      confidenceScore: 0
    });
    expect(snapshot.inputsStalenessSec).toBe(19 * 3600 + 38 * 60);
  });

  test.each(["single", "batch"])("rechecks %s cache freshness across Shanghai midnight", async (mode) => {
    vi.setSystemTime(new Date("2026-03-17T15:59:55.000Z"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(validPayload()));
    const service = createService();
    const read = async () => mode === "single"
      ? service.getOrComputeEstimate("023638")
      : (await service.getBatchEstimates(["023638"])).data[0];
    const before = await read();
    expect(before?.confidenceScore).toBe(100);

    vi.setSystemTime(new Date("2026-03-17T16:00:05.000Z"));
    const after = await read();
    expect(after).toMatchObject({ confidenceLevel: "LOW", confidenceScore: 0, estimateChangePct: -0.0257 });
    expect(after?.inputsStalenessSec).toBe(before!.inputsStalenessSec + 10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("aborts a stalled body even after response headers arrive", async () => {
    vi.setSystemTime(new Date("2026-03-17T06:30:00.000Z"));
    let signal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      signal = init?.signal;
      return new Response(new ReadableStream({
        start(controller) {
          signal?.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
        }
      }));
    });

    const result = createService().getBatchEstimates(["023638"]);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toEqual({ data: [], partialFailed: ["023638"] });
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("uses completion time when an uncached request crosses Shanghai midnight", async () => {
    vi.setSystemTime(new Date("2026-03-17T15:59:59.000Z"));
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return new Response(validPayload());
    });

    const result = createService().getOrComputeEstimate("023638");
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toMatchObject({
      confidenceLevel: "LOW",
      confidenceScore: 0,
      inputsStalenessSec: 9 * 3600 + 38 * 60
    });
  });

  test("refreshes earlier batch results when the last request completes on the next Shanghai day", async () => {
    vi.setSystemTime(new Date("2026-03-17T15:59:59.000Z"));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const fundCode = String(input).includes("/020273.js") ? "020273" : "023638";
      if (fundCode === "020273") {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      return new Response(validPayload({ fundcode: fundCode }));
    });

    const result = createService().getBatchEstimates(["023638", "020273"]);
    await vi.advanceTimersByTimeAsync(1_000);
    const response = await result;

    expect(response.partialFailed).toEqual([]);
    expect(response.data).toHaveLength(2);
    for (const snapshot of response.data) {
      expect(snapshot).toMatchObject({
        confidenceLevel: "LOW",
        confidenceScore: 0,
        inputsStalenessSec: 9 * 3600 + 38 * 60
      });
    }
  });

  test("clears its timeout when the request rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection failed"));

    await expect(createService().getBatchEstimates(["023638"])).resolves.toEqual({
      data: [], partialFailed: ["023638"]
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
