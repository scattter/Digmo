import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FundEstimateSnapshot } from "@digmo/shared";
import Fastify, { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SqliteDecisionStore } from "../../infra/decision/sqlite-decision-store.js";
import { SqliteWatchlistStore } from "../../infra/watchlist/sqlite-watchlist-store.js";
import { ValuationService } from "../../modules/valuation/service.js";
import { registerAuthRoutes } from "../auth.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { signAccessToken } from "../../modules/auth/token.js";
import { formatDate, isTradingDay, nowInShanghai } from "../../utils/time.js";
import { registerWatchlistRoutes } from "../watchlist.js";
import { ShareService } from "../../modules/share/service.js";

interface TestCtx {
  root: string;
  dbPath: string;
}

const tempRoots: string[] = [];
const TEST_JWT_SECRET = "digmo-test-jwt-secret";

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
  baseNavDate = "2026-03-02"
): FundEstimateSnapshot {
  return {
    fundCode,
    fundName: `基金${fundCode}`,
    officialNav: 1,
    estimateNav: 1,
    estimateChangePct,
    baseNavDate,
    estimateTime: "2026-03-02T02:00:00.000Z",
    confidenceLevel: "HIGH",
    confidenceScore: 90,
    method: "FUND_GZ_DIRECT",
    inputsStalenessSec: 1,
    topHoldings: [],
    disclaimer: "test"
  };
}

async function seedDailyDecision(input: {
  decisionStore: SqliteDecisionStore;
  userId: string;
  portfolioId: string;
  tradeDate: string;
  summary?: string;
}) {
  return input.decisionStore.saveDecisionRun({
    userId: input.userId,
    portfolioId: input.portfolioId,
    tradeDate: input.tradeDate,
    summary: input.summary ?? "测试建议",
    provider: "stub-provider",
    model: "stub-model",
    status: "SUCCESS",
    latencyMs: 10,
    actions: []
  });
}

async function createRouteApp(
  store: SqliteWatchlistStore,
  estimates: Record<string, number | EstimateSeed>,
  options?: {
    autoAuth?: boolean;
    decisionStore?: SqliteDecisionStore;
    serviceOverrides?: {
      getBatchEstimates?: (fundCodes: string[]) => Promise<{
        data: FundEstimateSnapshot[];
        partialFailed: string[];
      }>;
      getOrComputeEstimate?: (fundCode: string) => Promise<FundEstimateSnapshot>;
    };
  }
) {
  const app = Fastify({ logger: false });

  const service = {
    getBatchEstimates:
      options?.serviceOverrides?.getBatchEstimates ??
      (async (fundCodes: string[]) => {
        return {
          data: fundCodes
            .filter((code) => Object.prototype.hasOwnProperty.call(estimates, code))
            .map((code) => {
              const seed = toEstimateSeed(estimates[code]);
              return buildSnapshot(code, seed.estimateChangePct, seed.baseNavDate);
            }),
          partialFailed: []
        };
      }),
    getOrComputeEstimate:
      options?.serviceOverrides?.getOrComputeEstimate ??
      (async (fundCode: string) => {
        const seed = toEstimateSeed(estimates[fundCode] ?? 0);
        return buildSnapshot(fundCode, seed.estimateChangePct, seed.baseNavDate);
      })
  } as unknown as ValuationService;

  const requireAuth = createRequireAuth({
    store,
    jwtSecret: TEST_JWT_SECRET
  });

  registerAuthRoutes(app, {
    store,
    jwtSecret: TEST_JWT_SECRET,
    accessTokenExpiresInSec: 3600,
    requireAuth
  });

  registerWatchlistRoutes(app, {
    store,
    decisionStore: options?.decisionStore,
    service,
    shareService: new ShareService({ store }),
    requireAuth
  });

  if (options?.autoAuth !== false) {
    const admin = await store.getUserByUsername("admin");
    if (!admin) {
      throw new Error("bootstrap admin not found");
    }

    app.addHook("onRequest", async (request) => {
      const isProtectedRoute =
        request.url.startsWith("/v1/portfolios") ||
        request.url.startsWith("/v1/funds/flat");

      if (isProtectedRoute && !request.headers.authorization) {
        const token = signAccessToken(
          {
            sub: admin.id,
            username: admin.username,
            role: admin.role
          },
          TEST_JWT_SECRET,
          3600
        );
        request.headers.authorization = `Bearer ${token}`;
      }
    });
  }

  await app.ready();
  return app;
}

afterEach(() => {
  vi.useRealTimers();
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("watchlist routes", () => {
  test("requires authentication for watchlist routes", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01
    }, { autoAuth: false });

    const unauthorizedResp = await app.inject({
      method: "GET",
      url: "/v1/portfolios"
    });
    expect(unauthorizedResp.statusCode).toBe(401);

    const loginResp = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        username: "admin",
        password: "admin123456"
      }
    });
    expect(loginResp.statusCode).toBe(200);
    const loginPayload = loginResp.json() as { accessToken: string };
    expect(typeof loginPayload.accessToken).toBe("string");
    expect(loginPayload.accessToken.length).toBeGreaterThan(20);

    const authedResp = await app.inject({
      method: "GET",
      url: "/v1/portfolios",
      headers: {
        authorization: `Bearer ${loginPayload.accessToken}`
      }
    });
    expect(authedResp.statusCode).toBe(200);

    await app.close();
  });

  test("isolates portfolio data between different users", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(
      store,
      {
        "161725": 0.01
      },
      { autoAuth: false }
    );

    await store.createUser({
      username: "alice",
      password: "alice123456",
      role: "user"
    });

    const adminLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        username: "admin",
        password: "admin123456"
      }
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminToken = (adminLogin.json() as { accessToken: string }).accessToken;

    const aliceLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        username: "alice",
        password: "alice123456"
      }
    });
    expect(aliceLogin.statusCode).toBe(200);
    const aliceToken = (aliceLogin.json() as { accessToken: string }).accessToken;

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        name: "管理员组合",
        type: "FREE"
      }
    });
    expect(createResp.statusCode).toBe(201);
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    const aliceListResp = await app.inject({
      method: "GET",
      url: "/v1/portfolios",
      headers: {
        authorization: `Bearer ${aliceToken}`
      }
    });
    expect(aliceListResp.statusCode).toBe(200);
    const aliceListPayload = aliceListResp.json() as { portfolios: Array<{ id: string }> };
    expect(aliceListPayload.portfolios.length).toBe(0);

    const alicePatchResp = await app.inject({
      method: "PATCH",
      url: `/v1/portfolios/${portfolioId}`,
      headers: {
        authorization: `Bearer ${aliceToken}`
      },
      payload: {
        name: "越权修改"
      }
    });
    expect(alicePatchResp.statusCode).toBe(404);

    await app.close();
  });

  test("rejects invalid token for protected routes", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(
      store,
      {
        "161725": 0.01
      },
      { autoAuth: false }
    );

    const response = await app.inject({
      method: "GET",
      url: "/v1/portfolios",
      headers: {
        authorization: "Bearer invalid.token.value"
      }
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  test("accepts token when subject is missing but username maps to existing user", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(
      store,
      {
        "161725": 0.01
      },
      { autoAuth: false }
    );

    const admin = await store.getUserByUsername("admin");
    expect(admin).toBeDefined();

    const tokenWithUnknownSubject = signAccessToken(
      {
        sub: "00000000-0000-0000-0000-000000000000",
        username: admin!.username,
        role: admin!.role
      },
      TEST_JWT_SECRET,
      3600
    );

    const response = await app.inject({
      method: "GET",
      url: "/v1/portfolios",
      headers: {
        authorization: `Bearer ${tokenWithUnknownSubject}`
      }
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

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
    const firstAdmin = await firstStore.getUserByUsername("admin");
    expect(firstAdmin).toBeDefined();
    const firstPortfolios = await firstStore.listPortfolios(firstAdmin!.id);
    expect(firstPortfolios.length).toBe(1);
    expect(firstPortfolios[0].name).toBe("默认组合");

    const migratedFunds = await firstStore.listPortfolioFunds(firstAdmin!.id, firstPortfolios[0].id);
    expect(migratedFunds.length).toBe(1);
    expect(migratedFunds[0].fundCode).toBe("161725");
    expect(migratedFunds[0].holdingAmount).toBe(1000);

    const secondStore = new SqliteWatchlistStore(ctx.dbPath);
    const secondAdmin = await secondStore.getUserByUsername("admin");
    expect(secondAdmin).toBeDefined();
    const secondPortfolios = await secondStore.listPortfolios(secondAdmin!.id);
    expect(secondPortfolios.length).toBe(1);
    const secondFunds = await secondStore.listPortfolioFunds(secondAdmin!.id, secondPortfolios[0].id);
    expect(secondFunds.length).toBe(1);
  });

  test("migrates legacy portfolio rows when user_portfolio misses share_code column", async () => {
    const ctx = createTempCtx();

    const legacyDb = new DatabaseSync(ctx.dbPath);
    legacyDb.exec(`
      CREATE TABLE user_portfolio (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('FREE', 'RATIO')),
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, id)
      );

      CREATE TABLE user_portfolio_legacy (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('FREE', 'RATIO')),
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    legacyDb
      .prepare(
        `
          INSERT INTO user_portfolio_legacy (id, name, type, display_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run("legacy-free", "老组合", "FREE", 0, "2026-03-01 09:00:00", "2026-03-01 09:00:00");
    legacyDb.close();

    const store = new SqliteWatchlistStore(ctx.dbPath);
    const admin = await store.getUserByUsername("admin");
    expect(admin).toBeDefined();

    const portfolios = await store.listPortfolios(admin!.id);
    const migrated = portfolios.find((item) => item.id === "legacy-free");
    expect(migrated).toBeDefined();
    expect(migrated!.shareCode).toHaveLength(8);
  });

  test("exports and imports user data payload", async () => {
    const sourceCtx = createTempCtx();
    const sourceStore = new SqliteWatchlistStore(sourceCtx.dbPath);
    const sourceApp = await createRouteApp(sourceStore, {
      "161725": 0.01
    });

    const createResp = await sourceApp.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "迁移组合", type: "FREE" }
    });
    expect(createResp.statusCode).toBe(201);
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    const addResp = await sourceApp.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 2000, holdingProfitAmount: 120 }
    });
    expect(addResp.statusCode).toBe(201);

    const payload = await sourceStore.exportData({ username: "admin" });
    expect(payload.users.length).toBe(1);
    expect(payload.portfolios.length).toBe(1);
    expect(payload.portfolioFunds.length).toBe(1);

    const targetCtx = createTempCtx();
    const targetStore = new SqliteWatchlistStore(targetCtx.dbPath);
    await targetStore.importData(payload);

    const targetAdmin = await targetStore.getUserByUsername("admin");
    expect(targetAdmin).toBeDefined();
    const targetPortfolios = await targetStore.listPortfolios(targetAdmin!.id);
    expect(targetPortfolios.length).toBe(1);
    expect(targetPortfolios[0].name).toBe("迁移组合");

    const targetFunds = await targetStore.listPortfolioFunds(targetAdmin!.id, targetPortfolios[0].id);
    expect(targetFunds.length).toBe(1);
    expect(targetFunds[0].fundCode).toBe("161725");
    expect(targetFunds[0].holdingAmount).toBe(2000);

    await sourceApp.close();
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

  test("v2 portfolio daily profit endpoint is removed", async () => {
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
      url: `/v1/portfolios/${p1Id}/funds`,
      payload: { fundCode: "110011", holdingAmount: 500 }
    });
    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${p2Id}/funds`,
      payload: { fundCode: "161725", holdingAmount: 2000 }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v2/portfolios/daily-profit"
    });
    expect(response.statusCode).toBe(404);

    await app.close();
  });

  test("keeps holdings unchanged and uses estimate daily profit on repeated requests", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": {
        estimateChangePct: 0.02,
        baseNavDate: "2026-03-17"
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
    expect(firstPayload.funds[0].holdingAmount).toBe(1000);
    expect(firstPayload.funds[0].holdingProfitAmount).toBe(20);
    expect(firstPayload.funds[0].dailyProfitPct).toBe(0.02);
    expect(firstPayload.funds[0].dailyProfitOfficialUpdated).toBe(false);

    const secondListResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    expect(secondListResp.statusCode).toBe(200);
    const secondPayload = secondListResp.json() as {
      funds: Array<{
        holdingAmount: number;
        holdingProfitAmount: number;
        dailyProfitPct: number;
        dailyProfitOfficialUpdated: boolean;
      }>;
    };
    expect(secondPayload.funds[0].holdingAmount).toBe(1000);
    expect(secondPayload.funds[0].holdingProfitAmount).toBe(20);
    expect(secondPayload.funds[0].dailyProfitPct).toBe(0.02);
    expect(secondPayload.funds[0].dailyProfitOfficialUpdated).toBe(false);

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
    expect(summary?.dailyProfitPct).toBe(0.02);
    expect(summary?.allFundsDailyUpdated).toBe(false);

    await app.close();
  });

  test("uses estimate daily profit without requiring official daily return", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": {
        estimateChangePct: 0.03,
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

  test("returns unavailable summary profit when no estimate is available", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {});

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "缺少估值组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000 }
    });

    const portfolioResp = await app.inject({
      method: "GET",
      url: "/v1/portfolios"
    });
    expect(portfolioResp.statusCode).toBe(200);
    const portfolioPayload = portfolioResp.json() as {
      portfolios: Array<{ id: string; dailyProfitPct?: number; intradayEstimatePct?: number }>;
    };
    const summary = portfolioPayload.portfolios.find((item) => item.id === portfolioId);
    expect(summary).toBeDefined();
    expect(summary?.dailyProfitPct).toBeUndefined();
    expect(summary?.intradayEstimatePct).toBeUndefined();

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

  test("persists portfolio tab layout preference in backend", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.015
    });

    const initialResp = await app.inject({
      method: "GET",
      url: "/v1/portfolios/tab-layout"
    });
    expect(initialResp.statusCode).toBe(200);
    expect((initialResp.json() as { fundsTabIndex: number }).fundsTabIndex).toBe(0);

    const updateResp = await app.inject({
      method: "PATCH",
      url: "/v1/portfolios/tab-layout",
      payload: {
        fundsTabIndex: 2
      }
    });
    expect(updateResp.statusCode).toBe(200);

    const readAfterUpdateResp = await app.inject({
      method: "GET",
      url: "/v1/portfolios/tab-layout"
    });
    expect(readAfterUpdateResp.statusCode).toBe(200);
    expect((readAfterUpdateResp.json() as { fundsTabIndex: number }).fundsTabIndex).toBe(2);
    await app.close();

    const storeAfterRestart = new SqliteWatchlistStore(ctx.dbPath);
    const appAfterRestart = await createRouteApp(storeAfterRestart, {
      "161725": 0.015
    });
    const readAfterRestartResp = await appAfterRestart.inject({
      method: "GET",
      url: "/v1/portfolios/tab-layout"
    });
    expect(readAfterRestartResp.statusCode).toBe(200);
    expect((readAfterRestartResp.json() as { fundsTabIndex: number }).fundsTabIndex).toBe(2);

    const invalidResp = await appAfterRestart.inject({
      method: "PATCH",
      url: "/v1/portfolios/tab-layout",
      payload: {
        fundsTabIndex: -1
      }
    });
    expect(invalidResp.statusCode).toBe(400);

    await appAfterRestart.close();
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

  test("creates pending increase operation and settles after next working day at 09:00", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-23T07:20:00.000Z"));

    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "操作组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000, holdingProfitAmount: 100 }
    });

    const operateResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations`,
      payload: {
        operationType: "INCREASE",
        amount: 200
      }
    });
    expect(operateResp.statusCode).toBe(201);
    const operatePayload = operateResp.json() as {
      operation: {
        status: string;
        effectiveAt: string;
      };
    };
    expect(operatePayload.operation.status).toBe("PENDING");
    expect(operatePayload.operation.effectiveAt).toBe("2026-03-24T01:00:00.000Z");

    const fundsResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    expect(fundsResp.statusCode).toBe(200);
    const fundsPayload = fundsResp.json() as { funds: Array<{ holdingAmount: number; holdingProfitAmount: number }> };
    expect(fundsPayload.funds[0].holdingAmount).toBe(1000);
    expect(fundsPayload.funds[0].holdingProfitAmount).toBe(100);

    const historyResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/position-operations`
    });
    expect(historyResp.statusCode).toBe(200);
    const historyPayload = historyResp.json() as {
      items: Array<{
        operationType: string;
        amount: number;
        beforeHoldingAmount: number;
        afterHoldingAmount: number;
        status: string;
        effectiveAt: string;
        appliedAt?: string;
      }>;
    };
    expect(historyPayload.items.length).toBe(1);
    expect(historyPayload.items[0].operationType).toBe("INCREASE");
    expect(historyPayload.items[0].amount).toBe(200);
    expect(historyPayload.items[0].beforeHoldingAmount).toBe(1000);
    expect(historyPayload.items[0].afterHoldingAmount).toBe(1200);
    expect(historyPayload.items[0].status).toBe("PENDING");
    expect(historyPayload.items[0].effectiveAt).toBe("2026-03-24T01:00:00.000Z");
    expect(historyPayload.items[0].appliedAt).toBeUndefined();

    vi.setSystemTime(new Date("2026-03-24T00:59:59.000Z"));
    const beforeSettlementResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    const beforeSettlementPayload = beforeSettlementResp.json() as {
      funds: Array<{ holdingAmount: number; holdingProfitAmount: number }>;
    };
    expect(beforeSettlementPayload.funds[0].holdingAmount).toBe(1000);
    expect(beforeSettlementPayload.funds[0].holdingProfitAmount).toBe(100);

    vi.setSystemTime(new Date("2026-03-24T01:00:01.000Z"));
    const afterSettlementResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    const afterSettlementPayload = afterSettlementResp.json() as {
      funds: Array<{ holdingAmount: number; holdingProfitAmount: number }>;
    };
    expect(afterSettlementPayload.funds[0].holdingAmount).toBe(1200);
    expect(afterSettlementPayload.funds[0].holdingProfitAmount).toBe(100);

    const settledHistoryResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/position-operations`
    });
    const settledHistoryPayload = settledHistoryResp.json() as {
      items: Array<{ status: string; appliedAt?: string }>;
    };
    expect(settledHistoryPayload.items[0].status).toBe("APPLIED");
    expect(typeof settledHistoryPayload.items[0].appliedAt).toBe("string");

    await app.close();
  });

  test("creates pending decrease operation, settles on monday after friday, and shrinks profit proportionally", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-20T07:20:00.000Z"));

    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "减仓组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000, holdingProfitAmount: 100 }
    });

    const operateResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations`,
      payload: {
        operationType: "DECREASE",
        amount: 200
      }
    });
    expect(operateResp.statusCode).toBe(201);
    const operatePayload = operateResp.json() as {
      operation: {
        status: string;
        effectiveAt: string;
      };
    };
    expect(operatePayload.operation.status).toBe("PENDING");
    expect(operatePayload.operation.effectiveAt).toBe("2026-03-23T01:00:00.000Z");

    const fundsResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    const fundsPayload = fundsResp.json() as { funds: Array<{ holdingAmount: number; holdingProfitAmount: number }> };
    expect(fundsPayload.funds[0].holdingAmount).toBe(1000);
    expect(fundsPayload.funds[0].holdingProfitAmount).toBe(100);

    vi.setSystemTime(new Date("2026-03-23T00:59:59.000Z"));
    const beforeSettlementResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    const beforeSettlementPayload = beforeSettlementResp.json() as {
      funds: Array<{ holdingAmount: number; holdingProfitAmount: number }>;
    };
    expect(beforeSettlementPayload.funds[0].holdingAmount).toBe(1000);
    expect(beforeSettlementPayload.funds[0].holdingProfitAmount).toBe(100);

    vi.setSystemTime(new Date("2026-03-23T01:00:01.000Z"));
    const afterSettlementResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    const afterSettlementPayload = afterSettlementResp.json() as {
      funds: Array<{ holdingAmount: number; holdingProfitAmount: number }>;
    };
    expect(afterSettlementPayload.funds[0].holdingAmount).toBe(800);
    expect(afterSettlementPayload.funds[0].holdingProfitAmount).toBe(80);

    await app.close();
  });

  test("deletes pending operation before settlement and keeps holdings unchanged after effective time", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-23T07:20:00.000Z"));

    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "删除待生效组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000, holdingProfitAmount: 100 }
    });

    const operateResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations`,
      payload: {
        operationType: "INCREASE",
        amount: 200
      }
    });
    const operationId = (operateResp.json() as { operation: { id: string } }).operation.id;

    const deleteResp = await app.inject({
      method: "DELETE",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations/${operationId}`
    });
    expect(deleteResp.statusCode).toBe(200);
    expect((deleteResp.json() as { effect: string }).effect).toBe("REMOVED");

    const historyResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/position-operations?fundCode=161725`
    });
    const historyPayload = historyResp.json() as { items: Array<{ id: string }> };
    expect(historyPayload.items).toEqual([]);

    vi.setSystemTime(new Date("2026-03-24T01:00:01.000Z"));
    const afterSettlementResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    const afterSettlementPayload = afterSettlementResp.json() as {
      funds: Array<{ holdingAmount: number; holdingProfitAmount: number }>;
    };
    expect(afterSettlementPayload.funds[0].holdingAmount).toBe(1000);
    expect(afterSettlementPayload.funds[0].holdingProfitAmount).toBe(100);

    await app.close();
  });

  test("marks applied operation as manually canceled without changing holdings", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-23T07:20:00.000Z"));

    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "手动取消已生效组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000, holdingProfitAmount: 100 }
    });

    const operateResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations`,
      payload: {
        operationType: "INCREASE",
        amount: 200
      }
    });
    const operationId = (operateResp.json() as { operation: { id: string } }).operation.id;

    vi.setSystemTime(new Date("2026-03-24T01:00:01.000Z"));
    await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });

    const deleteResp = await app.inject({
      method: "DELETE",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations/${operationId}`
    });
    expect(deleteResp.statusCode).toBe(200);
    const deletePayload = deleteResp.json() as {
      effect: string;
      operation?: { manualCanceledAt?: string };
    };
    expect(deletePayload.effect).toBe("MARKED_MANUAL_CANCEL");
    expect(typeof deletePayload.operation?.manualCanceledAt).toBe("string");

    const fundsResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/funds`
    });
    const fundsPayload = fundsResp.json() as {
      funds: Array<{ holdingAmount: number; holdingProfitAmount: number }>;
    };
    expect(fundsPayload.funds[0].holdingAmount).toBe(1200);
    expect(fundsPayload.funds[0].holdingProfitAmount).toBe(100);

    const historyResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/position-operations?fundCode=161725`
    });
    const historyPayload = historyResp.json() as {
      items: Array<{
        status: string;
        manualCanceledAt?: string;
      }>;
    };
    expect(historyPayload.items[0].status).toBe("APPLIED");
    expect(typeof historyPayload.items[0].manualCanceledAt).toBe("string");

    await app.close();
  });

  test("rejects deleting a pending operation when recalculating remaining operations would exceed holdings", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-23T07:20:00.000Z"));

    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "删除重算冲突组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000, holdingProfitAmount: 100 }
    });

    const firstIncreaseResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations`,
      payload: {
        operationType: "INCREASE",
        amount: 500
      }
    });
    const firstOperationId = (firstIncreaseResp.json() as { operation: { id: string } }).operation.id;

    const secondDecreaseResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations`,
      payload: {
        operationType: "DECREASE",
        amount: 1200
      }
    });
    expect(secondDecreaseResp.statusCode).toBe(201);

    const deleteResp = await app.inject({
      method: "DELETE",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations/${firstOperationId}`
    });
    expect(deleteResp.statusCode).toBe(400);
    expect((deleteResp.json() as { message: string }).message).toContain("remaining pending operations");

    await app.close();
  });

  test("rejects a pending decrease that would exceed the projected holding after earlier pending decreases", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-23T07:20:00.000Z"));

    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "投影校验组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000, holdingProfitAmount: 100 }
    });

    const firstDecreaseResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations`,
      payload: {
        operationType: "DECREASE",
        amount: 600
      }
    });
    expect(firstDecreaseResp.statusCode).toBe(201);

    const secondDecreaseResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations`,
      payload: {
        operationType: "DECREASE",
        amount: 500
      }
    });
    expect(secondDecreaseResp.statusCode).toBe(400);

    await app.close();
  });

  test("rejects bindSuggestion because decision binding is disabled", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const decisionStore = new SqliteDecisionStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01
    }, { decisionStore });

    const admin = await store.getUserByUsername("admin");
    expect(admin).toBeDefined();

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "绑定组合", type: "FREE" }
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000, holdingProfitAmount: 100 }
    });

    const today = formatDate(nowInShanghai());
    const todayDecision = await seedDailyDecision({
      decisionStore,
      userId: admin!.id,
      portfolioId,
      tradeDate: today
    });

    const bindResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations`,
      payload: {
        operationType: "INCREASE",
        amount: 100,
        bindSuggestion: {
          decisionId: todayDecision.id,
          actionOrder: 0
        }
      }
    });
    expect(bindResp.statusCode).toBe(400);
    expect((bindResp.json() as { message: string }).message).toContain("bindSuggestion");

    await app.close();
  });

  test("supports operation history filter and limit", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01,
      "110011": 0.02
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "历史筛选组合", type: "FREE" }
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
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations`,
      payload: { operationType: "INCREASE", amount: 100 }
    });
    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds/110011/position-operations`,
      payload: { operationType: "DECREASE", amount: 50 }
    });

    const filteredResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/position-operations?fundCode=161725&limit=1`
    });
    expect(filteredResp.statusCode).toBe(200);
    const payload = filteredResp.json() as { items: Array<{ fundCode: string }> };
    expect(payload.items.length).toBe(1);
    expect(payload.items[0].fundCode).toBe("161725");

    await app.close();
  });

  test("migrates legacy position operations into applied records", async () => {
    const ctx = createTempCtx();

    const legacyDb = new DatabaseSync(ctx.dbPath);
    legacyDb.exec(`
      CREATE TABLE app_user (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
        status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE user_portfolio (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('FREE', 'RATIO')),
        share_code TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, id)
      );

      CREATE TABLE user_portfolio_fund (
        user_id TEXT NOT NULL,
        portfolio_id TEXT NOT NULL,
        fund_code TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        holding_amount REAL NOT NULL DEFAULT 0,
        holding_profit_amount REAL NOT NULL DEFAULT 0,
        planned_ratio REAL,
        last_holding_roll_nav_date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, portfolio_id, fund_code)
      );

      CREATE TABLE user_portfolio_fund_operation (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        portfolio_id TEXT NOT NULL,
        fund_code TEXT NOT NULL,
        operation_type TEXT NOT NULL CHECK(operation_type IN ('INCREASE', 'DECREASE')),
        amount REAL NOT NULL,
        before_holding_amount REAL NOT NULL,
        after_holding_amount REAL NOT NULL,
        before_holding_profit_amount REAL NOT NULL,
        after_holding_profit_amount REAL NOT NULL,
        bind_decision_id TEXT,
        bind_action_order INTEGER,
        bind_action_type TEXT CHECK(bind_action_type IN ('BUY', 'SELL', 'HOLD', 'REBALANCE')),
        bind_action_fund_code TEXT,
        bind_action_fund_name TEXT,
        bind_action_risk_level TEXT CHECK(bind_action_risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
        bind_action_rationale TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    legacyDb
      .prepare(
        `
          INSERT INTO app_user (id, username, password_hash, role, status, created_at, updated_at)
          VALUES (?, ?, ?, 'admin', 'active', ?, ?)
        `
      )
      .run("admin-user-id", "admin", "hashed", "2026-03-01 09:00:00", "2026-03-01 09:00:00");
    legacyDb
      .prepare(
        `
          INSERT INTO user_portfolio (user_id, id, name, type, share_code, display_order, created_at, updated_at)
          VALUES (?, ?, ?, 'FREE', ?, 0, ?, ?)
        `
      )
      .run("admin-user-id", "legacy-portfolio", "老组合", "ABCDEFGH", "2026-03-01 09:00:00", "2026-03-01 09:00:00");
    legacyDb
      .prepare(
        `
          INSERT INTO user_portfolio_fund (
            user_id,
            portfolio_id,
            fund_code,
            display_order,
            holding_amount,
            holding_profit_amount,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, 0, ?, ?, ?, ?)
        `
      )
      .run("admin-user-id", "legacy-portfolio", "161725", 1200, 100, "2026-03-01 09:00:00", "2026-03-01 09:00:00");
    legacyDb
      .prepare(
        `
          INSERT INTO user_portfolio_fund_operation (
            id,
            user_id,
            portfolio_id,
            fund_code,
            operation_type,
            amount,
            before_holding_amount,
            after_holding_amount,
            before_holding_profit_amount,
            after_holding_profit_amount,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        "legacy-operation",
        "admin-user-id",
        "legacy-portfolio",
        "161725",
        "INCREASE",
        200,
        1000,
        1200,
        100,
        100,
        "2026-03-01 09:00:00"
      );
    legacyDb.close();

    const store = new SqliteWatchlistStore(ctx.dbPath);
    const admin = await store.getUserByUsername("admin");
    expect(admin).toBeDefined();

    const operations = await store.listPositionOperations(admin!.id, "legacy-portfolio");
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe("APPLIED");
    expect(operations[0].effectiveAt).toBe("2026-03-01 09:00:00");
    expect(operations[0].appliedAt).toBe("2026-03-01 09:00:00");
    expect(operations[0].manualCanceledAt).toBeUndefined();
  });

  test("creates fixed share code for each portfolio", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, { "161725": 0.01 });

    await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "分享组合A", type: "FREE" },
    });
    await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "分享组合B", type: "FREE" },
    });

    const admin = await store.getUserByUsername("admin");
    expect(admin).toBeDefined();
    const portfolios = await store.listPortfolios(admin!.id);
    const shareCodes = portfolios.map((item) => item.shareCode);
    expect(shareCodes.length).toBe(2);
    expect(shareCodes[0]).toMatch(/^[A-Z0-9]{8}$/);
    expect(shareCodes[1]).toMatch(/^[A-Z0-9]{8}$/);
    expect(new Set(shareCodes).size).toBe(2);

    await app.close();
  });

  test("shares snapshot and imports with zero amounts while preserving planned ratios", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01,
      "110011": 0.02,
    });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "按比组合", type: "RATIO" },
    });
    const sourcePortfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${sourcePortfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 2000, holdingProfitAmount: 120, plannedRatio: 0.6 },
    });
    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${sourcePortfolioId}/funds`,
      payload: { fundCode: "110011", holdingAmount: 3000, holdingProfitAmount: -50, plannedRatio: 0.4 },
    });

    const shareResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${sourcePortfolioId}/share`,
      payload: { password: "123456" },
    });
    expect(shareResp.statusCode).toBe(200);
    const sharePayload = shareResp.json() as { shareCode: string; hasPassword: boolean };
    expect(sharePayload.hasPassword).toBe(true);

    const importResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios/import-by-share-code",
      payload: {
        shareCode: sharePayload.shareCode.toLowerCase(),
        password: "123456",
      },
    });
    expect(importResp.statusCode).toBe(200);
    const importPayload = importResp.json() as {
      portfolio: { id: string; type: string };
      importedFundCount: number;
    };
    expect(importPayload.portfolio.type).toBe("RATIO");
    expect(importPayload.importedFundCount).toBe(2);

    const fundsResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${importPayload.portfolio.id}/funds`,
    });
    expect(fundsResp.statusCode).toBe(200);
    const fundsPayload = fundsResp.json() as {
      funds: Array<{ fundCode: string; holdingAmount: number; holdingProfitAmount: number; plannedRatio?: number }>;
    };
    expect(fundsPayload.funds.length).toBe(2);
    const first = fundsPayload.funds.find((item) => item.fundCode === "161725");
    const second = fundsPayload.funds.find((item) => item.fundCode === "110011");
    expect(first?.holdingAmount).toBe(0);
    expect(first?.holdingProfitAmount).toBe(0);
    expect(first?.plannedRatio).toBe(0.6);
    expect(second?.holdingAmount).toBe(0);
    expect(second?.holdingProfitAmount).toBe(0);
    expect(second?.plannedRatio).toBe(0.4);

    const missingPasswordResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios/import-by-share-code",
      payload: {
        shareCode: sharePayload.shareCode,
      },
    });
    expect(missingPasswordResp.statusCode).toBe(400);

    const wrongPasswordResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios/import-by-share-code",
      payload: {
        shareCode: sharePayload.shareCode,
        password: "654321",
      },
    });
    expect(wrongPasswordResp.statusCode).toBe(400);

    await app.close();
  });

  test("imports share snapshot immutably and auto-suffixes conflicting names", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, {
      "161725": 0.01,
      "110011": 0.02,
      "020273": 0.03,
    });

    const sourceResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "策略组合", type: "FREE" },
    });
    const sourcePortfolioId = (sourceResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${sourcePortfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000 },
    });
    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${sourcePortfolioId}/share`,
      payload: { validity: "PERMANENT" },
    });

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${sourcePortfolioId}/funds`,
      payload: { fundCode: "110011", holdingAmount: 1500 },
    });

    await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "策略组合 (导入)", type: "FREE" },
    });

    const admin = await store.getUserByUsername("admin");
    expect(admin).toBeDefined();
    const sourcePortfolio = await store.getPortfolio(admin!.id, sourcePortfolioId);
    expect(sourcePortfolio).toBeDefined();

    const importResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios/import-by-share-code",
      payload: { shareCode: sourcePortfolio!.shareCode },
    });
    expect(importResp.statusCode).toBe(200);
    const importPayload = importResp.json() as {
      portfolio: { id: string; name: string };
      importedFundCount: number;
    };
    expect(importPayload.portfolio.name).toBe("策略组合 (导入2)");
    expect(importPayload.importedFundCount).toBe(1);

    const importedFundsResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${importPayload.portfolio.id}/funds`,
    });
    const importedFunds = (importedFundsResp.json() as { funds: Array<{ fundCode: string }> }).funds;
    expect(importedFunds.length).toBe(1);
    expect(importedFunds[0].fundCode).toBe("161725");

    await app.close();
  });

  test("returns unavailable for expired share", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createRouteApp(store, { "161725": 0.01 });

    const createResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: { name: "过期分享组合", type: "FREE" },
    });
    const portfolioId = (createResp.json() as { portfolio: { id: string } }).portfolio.id;
    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: { fundCode: "161725", holdingAmount: 1000 },
    });
    const shareResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/share`,
      payload: { validity: "SEVEN_DAYS" },
    });
    const shareCode = (shareResp.json() as { shareCode: string }).shareCode;

    const db = new DatabaseSync(ctx.dbPath);
    db.prepare(
      `
        UPDATE user_portfolio_share
        SET expires_at = ?
        WHERE share_code = ? AND status = 'ACTIVE'
      `,
    ).run("2000-01-01T00:00:00.000Z", shareCode);
    db.close();

    const importResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios/import-by-share-code",
      payload: { shareCode },
    });
    expect(importResp.statusCode).toBe(404);

    await app.close();
  });
});
