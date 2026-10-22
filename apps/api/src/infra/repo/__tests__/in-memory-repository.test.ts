import { describe, expect, test } from "vitest";
import { InMemoryRepository } from "../in-memory-repository.js";
import type { StoredEstimate } from "../repository.js";

function estimate(fundCode: string, index: number): StoredEstimate {
  const time = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  return {
    fundCode,
    fundName: "测试基金",
    officialNav: 1,
    estimateNav: 1.23456,
    estimateChangePct: 0.23456,
    baseNavDate: "2025-12-31",
    estimateTime: time,
    estimateTimeBucket: time,
    confidenceLevel: "LOW",
    confidenceScore: 0,
    method: "FUND_GZ_DIRECT",
    inputsStalenessSec: 0,
    topHoldings: [],
    disclaimer: "仅供参考",
    inputs: { quoteCodes: [], quoteTime: time, fitScore: 0 }
  };
}

describe("in-memory repository retention", () => {
  test("retains the latest 256 estimate buckets, including out-of-order updates", async () => {
    const repository = new InMemoryRepository();
    for (let index = 0; index < 300; index += 1) {
      await repository.saveEstimate(estimate("161725", index));
    }
    await repository.saveEstimate(estimate("161725", 0));
    await repository.saveEstimate({ ...estimate("161725", 299), estimateNav: 1.56789 });

    const retained = Reflect.get(repository, "estimates") as Map<string, StoredEstimate[]>;
    expect(retained.get("161725")).toHaveLength(256);
    expect(retained.get("161725")?.[0]?.estimateTimeBucket).toBe(estimate("161725", 44).estimateTimeBucket);
    expect(await repository.getLatestEstimate("161725")).toMatchObject({
      estimateTimeBucket: estimate("161725", 299).estimateTimeBucket,
      estimateNav: 1.5679,
      estimateChangePct: 0.2346
    });
  });

  test("retains recent NAV dates and replaces duplicate dates", async () => {
    const repository = new InMemoryRepository();
    for (let index = 0; index < 300; index += 1) {
      await repository.saveNavRecord({
        fundCode: "161725",
        navDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
        nav: 1,
        dailyReturn: 0
      });
    }
    const latest = (await repository.getLatestNavRecord("161725"))!;
    await repository.saveNavRecord({ ...latest, nav: 2 });

    const retained = await repository.getRecentNavRecords("161725", 1000);
    expect(retained).toHaveLength(256);
    expect(retained[0]?.navDate).toBe("2026-02-14");
    expect(retained.at(-1)?.nav).toBe(2);
  });

  test("bounds fund records and retains recently updated data", async () => {
    const repository = new InMemoryRepository();
    for (let index = 0; index < 2001; index += 1) {
      const fundCode = String(index).padStart(6, "0");
      await repository.saveFundProfile({ fundCode, fundName: fundCode, fundType: "混合型" });
      await repository.saveNavRecord({ fundCode, navDate: "2026-10-21", nav: 1, dailyReturn: 0 });
      await repository.saveHoldingSnapshot({ fundCode, reportDate: "2026-06-30", stockRatio: 0, bondRatio: 0, cashRatio: 1, holdings: [] });
      await repository.saveQuotes([{ code: fundCode, name: fundCode, quoteDate: "2026-10-22", quoteTime: "15:00:00", changePct: 0, source: "test" }]);
      await repository.saveEstimate(estimate(fundCode, 0));
    }

    expect(await repository.listFundCodes()).toHaveLength(2000);
    expect(await repository.getFundProfile("000000")).toBeUndefined();
    expect(await repository.getLatestNavRecord("000000")).toBeUndefined();
    expect(await repository.getLatestHoldingSnapshot("000000")).toBeUndefined();
    expect(await repository.getLatestQuote("000000")).toBeUndefined();
    expect(await repository.getLatestEstimate("000000")).toBeUndefined();
    expect(await repository.getLatestEstimate("002000")).toBeDefined();

    await repository.saveFundProfile({ fundCode: "000001", fundName: "更新", fundType: "混合型" });
    await repository.saveFundProfile({ fundCode: "002001", fundName: "新基金", fundType: "混合型" });
    expect(await repository.getFundProfile("000001")).toMatchObject({ fundName: "更新" });
    expect(await repository.getFundProfile("000002")).toBeUndefined();
  });
});
