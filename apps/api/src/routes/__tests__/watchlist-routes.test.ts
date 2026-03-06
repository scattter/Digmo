import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FundEstimateSnapshot } from "@digmo/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, test } from "vitest";
import { SqliteWatchlistStore } from "../../infra/watchlist/sqlite-watchlist-store";
import { ValuationService } from "../../modules/valuation/service";
import { formatDate, isTradingDay, nowInShanghai } from "../../utils/time";
import { registerWatchlistRoutes } from "../watchlist";

interface TestCtx {
  root: string;
  dbPath: string;
}

const tempRoots: string[] = [];

function createTempCtx(): TestCtx {
  const root = mkdtempSync(join(tmpdir(), "digmo-watchlist-test-"));
  const dbPath = join(root, "watchlist.sqlite");
  tempRoots.push(root);
  return {
    root,
    dbPath
  };
}

interface EstimateSeed {
  estimateChangePct: number;
  officialDailyReturn?: number;
  baseNavDate?: string;
}

function toEstimateSeed(input: number | EstimateSeed): EstimateSeed {
  if (typeof input === "number") {
    return {
      estimateChangePct: input
    };
  }
  return input;
}

function buildSnapshot(
  fundCode: string,
  estimateChangePct: number,
  officialDailyReturn = 0,
  baseNavDate = "2026-03-02"
): FundEstimateSnapshot {
  return {
    fundCode,
    fundName: `基金${fundCode}`,
    officialNav: 1,
    officialDailyReturn,
    estimateNav: 1,
    estimateChangePct,
    baseNavDate,
    estimateTime: "2026-03-02T02:00:00.000Z",
    confidenceLevel: "HIGH",
    confidenceScore: 90,
    method: "BETA_PROXY",
    inputsStalenessSec: 1,
    topHoldings: [],
    disclaimer: "test"
  };
}

async function createRouteApp(store: SqliteWatchlistStore, estimates: Record<string, number | EstimateSeed>) {
  const app = Fastify({ logger: false });

  const service = {
    getBatchEstimates: async (fundCodes: string[]) => {
      return {
        data: fundCodes
          .filter((code) => Object.prototype.hasOwnProperty.call(estimates, code))
          .map((code) => {
            const seed = toEstimateSeed(estimates[code]);
            return buildSnapshot(code, seed.estimateChangePct, seed.officialDailyReturn, seed.baseNavDate);
          }),
        partialFailed: []
      };
    },
    getOrComputeEstimate: async (fundCode: string) => {
      const seed = toEstimateSeed(estimates[fundCode] ?? 0);
      return buildSnapshot(fundCode, seed.estimateChangePct, seed.officialDailyReturn, seed.baseNavDate);
    }
  } as unknown as ValuationService;

  registerWatchlistRoutes(app, {
    store,
    service
  });

  await app.ready();
  return app;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("watchlist routes", () => {
  test("migrates legacy watchlist into default portfolio and keeps migration idempotent", async () => {
    const ctx = createTempCtx();

    const legacyDb = new DatabaseSync(ctx.dbPath);
    legacyDb.exec(`
      CREATE TABLE user_watchlist_fund (
        fund_code TEXT PRIMARY KEY,
        holding_amount REAL,
        total_change_pct REAL,
        last_accumulated_nav_date TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    legacyDb
      .prepare(
        `
          INSERT INTO user_watchlist_fund (
            fund_code,
            holding_amount,
            total_change_pct,
            last_accumulated_nav_date,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run("161725", 1000, 0.12, "2026-03-01", "2026-03-01 09:00:00", "2026-03-01 09:00:00");
    legacyDb.close();

    const firstStore = new SqliteWatchlistStore(ctx.dbPath);
    const firstPortfolios = await firstStore.listPortfolios();
    expect(firstPortfolios.length).toBe(1);
    expect(firstPortfolios[0].name).toBe("默认组合");

    const migratedFunds = await firstStore.listPortfolioFunds(firstPortfolios[0].id);
    expect(migratedFunds.length).toBe(1);
    expect(migratedFunds[0].fundCode).toBe("161725");
    expect(migratedFunds[0].holdingAmount).toBe(1000);

    const secondStore = new SqliteWatchlistStore(ctx.dbPath);
    const secondPortfolios = await secondStore.listPortfolios();
    expect(secondPortfolios.length).toBe(1);
    const secondFunds = await secondStore.listPortfolioFunds(secondPortfolios[0].id);
    expect(secondFunds.length).toBe(1);
  });

  test("rejects ratio portfolio when planned ratio sum exceeds 100%", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01,
      "110011": 0.02
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: {
        name: "比例组合A",
        type: "RATIO"
      }
    });
    expect(createResp.statusCode).toBe(201);
    const created = createResp.json() as { portfolio: { id: string } };

    const addFirstResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${created.portfolio.id}/funds`,
      payload: {
        fundCode: "161725",
        holdingAmount: 1000,
        plannedRatio: 0.7
      }
    });
    expect(addFirstResp.statusCode).toBe(201);

    const addSecondResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${created.portfolio.id}/funds`,
      payload: {
        fundCode: "110011",
        holdingAmount: 1000,
        plannedRatio: 0.4
      }
    });
    expect(addSecondResp.statusCode).toBe(400);

    await app.close();
  });

  test("supports flat dedup and expanded modes with sort", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.02,
      "110011": -0.01
    });

    const p1Resp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "组合一", type: "FREE" }
    });
    const p2Resp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "组合二", type: "FREE" }
    });

    const p1Id = (p1Resp.json() as { portfolio: { id: string } }).portfolio.id;
    const p2Id = (p2Resp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${p1Id}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000 }
    });
    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${p2Id}/funds`,
      payload: { fundCode: "161725", holdingAmount: 500 }
    });
    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${p1Id}/funds`,
      payload: { fundCode: "110011", holdingAmount: 300 }
    });

    const dedupResp = await app.inject({
      method: "GET",
      url: "/v1/funds/flat?expand=dedup&sortOrder=desc"
    });
    expect(dedupResp.statusCode).toBe(200);
    const dedup = dedupResp.json() as { items: Array<{ fundCode: string; holdingAmount: number; portfolioCount: number }> };
    expect(dedup.items.length).toBe(2);
    expect(dedup.items[0].fundCode).toBe("161725");
    expect(dedup.items[0].holdingAmount).toBe(1500);
    expect(dedup.items[0].portfolioCount).toBe(2);

    const expandedResp = await app.inject({
      method: "GET",
      url: "/v1/funds/flat?expand=expanded&sortOrder=desc"
    });
    expect(expandedResp.statusCode).toBe(200);
    const expanded = expandedResp.json() as { items: Array<{ fundCode: string }> };
    expect(expanded.items.filter((item) => item.fundCode === "161725").length).toBe(2);

    await app.close();
  });

  test("returns merged total profit display in portfolio summary", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.015
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "收益组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000 }
    });

    const updateResp = await app.inject({
      method: "PATCH",
      url: `/v1/portfolios/${portfolioId}/funds/161725`,
      payload: { holdingAmount: 1100, holdingProfitAmount: 100 }
    });
    expect(updateResp.statusCode).toBe(200);

    const listResp = await app.inject({
      method: "GET",
      url: "/v1/portfolios"
    });
    expect(listResp.statusCode).toBe(200);

    const payload = listResp.json() as {
      portfolios: Array<{
        name: string;
        totalProfitDisplay: string;
        dailyProfitPct: number;
        allFundsDailyUpdated: boolean;
      }>;
    };
    const target = payload.portfolios.find((item) => item.name === "收益组合");

    expect(target).toBeDefined();
    expect(target?.totalProfitDisplay).toContain("/");
    expect(target?.totalProfitDisplay).toContain("10.00%");
    expect(typeof target?.dailyProfitPct).toBe("number");
    expect(typeof target?.allFundsDailyUpdated).toBe("boolean");

    await app.close();
  });

  test("rolls holding amount and holding profit once when official nav date updates", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const today = formatDate(nowInShanghai());
    const app = await createRouteApp(store, {
      "161725": {
        estimateChangePct: 0.02,
        officialDailyReturn: 0.01,
        baseNavDate: today
      }
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "滚动组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000, holdingProfitAmount: 20 }
    });

    const tradingDay = isTradingDay(nowInShanghai());

    const firstListResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    expect(firstListResp.statusCode).toBe(200);
    const firstPayload = firstListResp.json() as {
      funds: Array<{
        holdingAmount: number;
        holdingProfitAmount: number;
        dailyProfitPct: number;
        dailyProfitOfficialUpdated: boolean;
      }>;
    };
    if (tradingDay) {
      expect(firstPayload.funds[0].holdingAmount).toBe(1010);
      expect(firstPayload.funds[0].holdingProfitAmount).toBe(30);
      expect(firstPayload.funds[0].dailyProfitPct).toBe(0.01);
      expect(firstPayload.funds[0].dailyProfitOfficialUpdated).toBe(true);
    } else {
      expect(firstPayload.funds[0].holdingAmount).toBe(1000);
      expect(firstPayload.funds[0].holdingProfitAmount).toBe(20);
      expect(firstPayload.funds[0].dailyProfitPct).toBe(0.02);
      expect(firstPayload.funds[0].dailyProfitOfficialUpdated).toBe(false);
    }

    const secondListResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    expect(secondListResp.statusCode).toBe(200);
    const secondPayload = secondListResp.json() as {
      funds: Array<{ holdingAmount: number; holdingProfitAmount: number }>;
    };
    if (tradingDay) {
      expect(secondPayload.funds[0].holdingAmount).toBe(1010);
      expect(secondPayload.funds[0].holdingProfitAmount).toBe(30);
    } else {
      expect(secondPayload.funds[0].holdingAmount).toBe(1000);
      expect(secondPayload.funds[0].holdingProfitAmount).toBe(20);
    }

    const portfolioResp = await app.inject({
      method: "GET",
      url: "/v1/portfolios"
    });
    expect(portfolioResp.statusCode).toBe(200);
    const portfolioPayload = portfolioResp.json() as {
      portfolios: Array<{ id: string; dailyProfitPct: number; allFundsDailyUpdated: boolean }>;
    };
    const summary = portfolioPayload.portfolios.find((item) => item.id === portfolioId);
    expect(summary).toBeDefined();
    expect(summary?.dailyProfitPct).toBe(tradingDay ? 0.01 : 0.02);
    expect(summary?.allFundsDailyUpdated).toBe(tradingDay);

    await app.close();
  });

  test("uses estimate daily profit when official data is not accumulated", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": {
        estimateChangePct: 0.03,
        officialDailyReturn: Number.NaN,
        baseNavDate: "2026-03-05"
      }
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "估算口径组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000 }
    });

    const listResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    expect(listResp.statusCode).toBe(200);
    const payload = listResp.json() as {
      funds: Array<{ dailyProfitPct: number; holdingAmount: number; dailyProfitOfficialUpdated: boolean }>;
    };
    expect(payload.funds[0].dailyProfitPct).toBe(0.03);
    expect(payload.funds[0].holdingAmount).toBe(1000);
    expect(payload.funds[0].dailyProfitOfficialUpdated).toBe(false);

    await app.close();
  });

  test("supports negative holding profit updates and rejects invalid holding profit amount", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.02
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "收益编辑组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000 }
    });

    const invalidResp = await app.inject({
      method: "PATCH",
      url: `/v1/portfolios/${portfolioId}/funds/161725`,
      payload: { holdingProfitAmount: "abc" }
    });
    expect(invalidResp.statusCode).toBe(400);

    const updateResp = await app.inject({
      method: "PATCH",
      url: `/v1/portfolios/${portfolioId}/funds/161725`,
      payload: { holdingProfitAmount: -88.36 }
    });
    expect(updateResp.statusCode).toBe(200);

    const listResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    expect(listResp.statusCode).toBe(200);
    const payload = listResp.json() as { funds: Array<{ holdingProfitAmount: number }> };
    expect(payload.funds[0].holdingProfitAmount).toBe(-88.36);

    await app.close();
  });

  test("reorders portfolios and appends new portfolio to the end", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.015
    });

    const p1Resp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "组合A", type: "FREE" }
    });
    const p2Resp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "组合B", type: "FREE" }
    });
    const p3Resp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "组合C", type: "FREE" }
    });
    const p1Id = (p1Resp.json() as { portfolio: { id: string } }).portfolio.id;
    const p2Id = (p2Resp.json() as { portfolio: { id: string } }).portfolio.id;
    const p3Id = (p3Resp.json() as { portfolio: { id: string } }).portfolio.id;

    const initialResp = await app.inject({
      method: "GET",
      url: "/v1/portfolios"
    });
    expect(initialResp.statusCode).toBe(200);
    const initialPayload = initialResp.json() as { portfolios: Array<{ id: string }> };
    expect(initialPayload.portfolios.map((item) => item.id)).toEqual([p1Id, p2Id, p3Id]);

    const reorderResp = await app.inject({
      method: "PATCH",
      url: "/v1/portfolios/order",
      payload: {
        portfolioIds: [p3Id, p1Id, p2Id]
      }
    });
    expect(reorderResp.statusCode).toBe(200);

    const reorderedResp = await app.inject({
      method: "GET",
      url: "/v1/portfolios"
    });
    expect(reorderedResp.statusCode).toBe(200);
    const reorderedPayload = reorderedResp.json() as { portfolios: Array<{ id: string }> };
    expect(reorderedPayload.portfolios.map((item) => item.id)).toEqual([p3Id, p1Id, p2Id]);

    const p4Resp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "组合D", type: "FREE" }
    });
    const p4Id = (p4Resp.json() as { portfolio: { id: string } }).portfolio.id;

    const afterCreateResp = await app.inject({
      method: "GET",
      url: "/v1/portfolios"
    });
    expect(afterCreateResp.statusCode).toBe(200);
    const afterCreatePayload = afterCreateResp.json() as { portfolios: Array<{ id: string }> };
    expect(afterCreatePayload.portfolios.map((item) => item.id)).toEqual([p3Id, p1Id, p2Id, p4Id]);

    await app.close();
  });

  test("rejects invalid reorder payload for portfolios", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.015
    });

    const p1Resp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "组合A", type: "FREE" }
    });
    const p2Resp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "组合B", type: "FREE" }
    });
    const p1Id = (p1Resp.json() as { portfolio: { id: string } }).portfolio.id;
    const p2Id = (p2Resp.json() as { portfolio: { id: string } }).portfolio.id;

    const missingResp = await app.inject({
      method: "PATCH",
      url: "/v1/portfolios/order",
      payload: {
        portfolioIds: [p1Id]
      }
    });
    expect(missingResp.statusCode).toBe(400);

    const duplicateResp = await app.inject({
      method: "PATCH",
      url: "/v1/portfolios/order",
      payload: {
        portfolioIds: [p1Id, p1Id]
      }
    });
    expect(duplicateResp.statusCode).toBe(400);

    const unknownResp = await app.inject({
      method: "PATCH",
      url: "/v1/portfolios/order",
      payload: {
        portfolioIds: [p1Id, "unknown-portfolio-id"]
      }
    });
    expect(unknownResp.statusCode).toBe(400);

    const validResp = await app.inject({
      method: "PATCH",
      url: "/v1/portfolios/order",
      payload: {
        portfolioIds: [p2Id, p1Id]
      }
    });
    expect(validResp.statusCode).toBe(200);

    await app.close();
  });

  test("reorders portfolio funds and persists order", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.015,
      "110011": 0.02,
      "006327": -0.01,
      "009033": 0.005
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "可排序组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000 }
    });
    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "110011", holdingAmount: 1000 }
    });
    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "006327", holdingAmount: 1000 }
    });

    const initialResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    expect(initialResp.statusCode).toBe(200);
    const initialPayload = initialResp.json() as { funds: Array<{ fundCode: string }> };
    expect(initialPayload.funds.map((item) => item.fundCode)).toEqual(["161725", "110011", "006327"]);

    const reorderResp = await app.inject({
      method: "PATCH",
      url: `/v1/portfolios/${portfolioId}/funds/order`,
      payload: {
        fundCodes: ["110011", "161725", "006327"]
      }
    });
    expect(reorderResp.statusCode).toBe(200);

    const reorderedListResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    const reorderedListPayload = reorderedListResp.json() as {
      funds: Array<{ fundCode: string; displayOrder: number }>;
    };
    expect(reorderedListPayload.funds.map((item) => item.fundCode)).toEqual(["110011", "161725", "006327"]);
    expect(reorderedListPayload.funds.map((item) => item.displayOrder)).toEqual([0, 1, 2]);

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "009033", holdingAmount: 500 }
    });

    const afterAddResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    const afterAddPayload = afterAddResp.json() as { funds: Array<{ fundCode: string }> };
    expect(afterAddPayload.funds.map((item) => item.fundCode)).toEqual(["110011", "161725", "006327", "009033"]);

    await app.close();
  });

  test("rejects invalid reorder payload for portfolio funds", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.015,
      "110011": 0.02,
      "006327": -0.01
    });

    const p1Resp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "组合A", type: "FREE" }
    });
    const p2Resp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "组合B", type: "FREE" }
    });

    const p1Id = (p1Resp.json() as { portfolio: { id: string } }).portfolio.id;
    const p2Id = (p2Resp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${p1Id}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000 }
    });
    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${p1Id}/funds`,
      payload: { fundCode: "110011", holdingAmount: 1000 }
    });
    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${p2Id}/funds`,
      payload: { fundCode: "006327", holdingAmount: 1000 }
    });

    const missingFundResp = await app.inject({
      method: "PATCH",
      url: `/v1/portfolios/${p1Id}/funds/order`,
      payload: {
        fundCodes: ["161725"]
      }
    });
    expect(missingFundResp.statusCode).toBe(400);

    const duplicateFundResp = await app.inject({
      method: "PATCH",
      url: `/v1/portfolios/${p1Id}/funds/order`,
      payload: {
        fundCodes: ["161725", "161725"]
      }
    });
    expect(duplicateFundResp.statusCode).toBe(400);

    const crossPortfolioFundResp = await app.inject({
      method: "PATCH",
      url: `/v1/portfolios/${p1Id}/funds/order`,
      payload: {
        fundCodes: ["161725", "006327"]
      }
    });
    expect(crossPortfolioFundResp.statusCode).toBe(400);

    await app.close();
  });
});
