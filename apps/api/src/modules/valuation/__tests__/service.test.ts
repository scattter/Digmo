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
});
