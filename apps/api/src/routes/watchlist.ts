import {
  ERROR_CODES,
  FlatFundItem,
  FundEstimateSnapshot,
  PortfolioFundItem,
  PortfolioSummary,
  PortfolioType,
  TrendType
} from "@digmo/shared";
import { FastifyInstance } from "fastify";
import {
  PortfolioItem,
  SqliteWatchlistStore,
  UpdatePortfolioFundInput,
  WatchlistStore
} from "../infra/watchlist/sqlite-watchlist-store";
import { ValuationService } from "../modules/valuation/service";
import { AppError } from "../utils/app-error";
import { isTradingDay, nowInShanghai } from "../utils/time";

interface RegisterWatchlistRoutesDeps {
  store: WatchlistStore;
  service: ValuationService;
}

interface FlatQuery {
  expand?: "dedup" | "expanded";
  sortOrder?: "default" | "asc" | "desc";
}

function ensureFundCode(fundCode: string): void {
  if (!/^\d{6}$/.test(fundCode)) {
    throw new AppError(ERROR_CODES.INVALID_FUND_CODES, "fundCode must be a 6-digit string", 400);
  }
}

function ensurePortfolioId(portfolioId: string): void {
  if (!portfolioId.trim()) {
    throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "portfolioId is required", 400);
  }
}

function parseHoldingAmount(raw: unknown, required: boolean): number | undefined {
  if (raw === undefined || raw === null || raw === "") {
    if (required) {
      throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "holdingAmount is required", 400);
    }
    return undefined;
  }

  const value = typeof raw === "string" ? Number(raw.trim()) : Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "holdingAmount must be a non-negative number", 400);
  }

  return Number(value.toFixed(2));
}

function parsePlannedRatio(raw: unknown, required: boolean): number | undefined {
  if (raw === undefined || raw === null || raw === "") {
    if (required) {
      throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "plannedRatio is required for ratio portfolio", 400);
    }
    return undefined;
  }

  const value = typeof raw === "string" ? Number(raw.trim()) : Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "plannedRatio must be between 0 and 1", 400);
  }

  return Number(value.toFixed(6));
}

function parsePortfolioType(raw: unknown): PortfolioType {
  if (raw === "FREE" || raw === "RATIO") {
    return raw;
  }
  throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "type must be FREE or RATIO", 400);
}

function parsePortfolioName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length === 0) {
    throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "name is required", 400);
  }
  if (name.length > 40) {
    throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "name must be <= 40 chars", 400);
  }
  return name;
}

function parseFundCodes(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "fundCodes must be a non-empty array", 400);
  }

  const fundCodes = raw.map((item) => (typeof item === "string" ? item.trim() : ""));
  for (const fundCode of fundCodes) {
    ensureFundCode(fundCode);
  }

  return fundCodes;
}

function trendFromEstimate(estimateChangePct: number | undefined): TrendType {
  if (typeof estimateChangePct !== "number") {
    return "FLAT";
  }
  if (estimateChangePct > 0.0001) {
    return "UP";
  }
  if (estimateChangePct < -0.0001) {
    return "DOWN";
  }
  return "FLAT";
}

function formatSignedAmount(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedPct(value: number): string {
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

async function chunkGetEstimates(
  service: ValuationService,
  fundCodes: string[]
): Promise<Map<string, FundEstimateSnapshot>> {
  const map = new Map<string, FundEstimateSnapshot>();
  const chunkSize = 50;

  for (let i = 0; i < fundCodes.length; i += chunkSize) {
    const chunk = fundCodes.slice(i, i + chunkSize);
    const response = await service.getBatchEstimates(chunk);
    for (const item of response.data) {
      map.set(item.fundCode, item);
    }
  }

  return map;
}

async function syncFundStateWithLatestReturns(
  store: WatchlistStore,
  service: ValuationService,
  fundCodes: string[]
): Promise<void> {
  if (fundCodes.length === 0 || !isTradingDay(nowInShanghai())) {
    return;
  }

  for (const fundCode of fundCodes) {
    try {
      const snapshot = await service.getOrComputeEstimate(fundCode);
      await store.accumulateOfficialReturn(fundCode, snapshot.baseNavDate, snapshot.officialDailyReturn);
    } catch {
      // 忽略单只基金同步失败，避免整体接口失败。
    }
  }
}

function sortByEstimate<T extends { estimateChangePct?: number; fundCode: string }>(items: T[], order: "asc" | "desc"): T[] {
  return items.slice().sort((a, b) => {
    const av = a.estimateChangePct;
    const bv = b.estimateChangePct;

    const aMissing = typeof av !== "number";
    const bMissing = typeof bv !== "number";

    if (aMissing && !bMissing) {
      return 1;
    }
    if (!aMissing && bMissing) {
      return -1;
    }
    if (aMissing && bMissing) {
      return a.fundCode.localeCompare(b.fundCode);
    }

    const diff = order === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    if (Math.abs(diff) > 0.0000001) {
      return diff;
    }

    return a.fundCode.localeCompare(b.fundCode);
  });
}

async function ensurePortfolioOrThrow(store: WatchlistStore, portfolioId: string): Promise<PortfolioItem> {
  const portfolio = await store.getPortfolio(portfolioId);
  if (!portfolio) {
    throw new AppError(ERROR_CODES.PORTFOLIO_NOT_FOUND, `portfolio ${portfolioId} not found`, 404);
  }
  return portfolio;
}

async function buildPortfolioSummaries(
  store: WatchlistStore,
  service: ValuationService
): Promise<{
  portfolios: PortfolioSummary[];
  estimateMap: Map<string, FundEstimateSnapshot>;
  fundStateMap: Map<string, { totalChangePct: number }>;
}> {
  const portfolios = await store.listPortfolios();
  const portfolioFunds = await store.listAllPortfolioFunds();
  const fundCodes = Array.from(new Set(portfolioFunds.map((item) => item.fundCode)));

  await syncFundStateWithLatestReturns(store, service, fundCodes);

  const [estimateMap, fundStates] = await Promise.all([
    chunkGetEstimates(service, fundCodes),
    store.listFundStatesByCodes(fundCodes)
  ]);

  const fundStateMap = new Map<string, { totalChangePct: number }>();
  for (const [code, row] of fundStates.entries()) {
    fundStateMap.set(code, { totalChangePct: row.totalChangePct });
  }

  const grouped = new Map<string, PortfolioFundItem[]>();
  for (const item of portfolioFunds) {
    const estimate = estimateMap.get(item.fundCode);
    const totalChangePct = fundStateMap.get(item.fundCode)?.totalChangePct ?? 0;
    const totalProfitAmount = Number((item.holdingAmount * totalChangePct).toFixed(2));
    const trend = trendFromEstimate(estimate?.estimateChangePct);

    const vm: PortfolioFundItem = {
      portfolioId: item.portfolioId,
      portfolioName: item.portfolioName,
      portfolioType: item.portfolioType,
      fundCode: item.fundCode,
      displayOrder: item.displayOrder,
      fundName: estimate?.fundName,
      holdingAmount: item.holdingAmount,
      estimateChangePct: estimate?.estimateChangePct,
      totalChangePct,
      intradayAmount:
        typeof estimate?.estimateChangePct === "number"
          ? Number((item.holdingAmount * estimate.estimateChangePct).toFixed(2))
          : undefined,
      totalProfitAmount,
      trend,
      plannedRatio: item.portfolioType === "RATIO" ? item.plannedRatio : undefined
    };

    if (!grouped.has(item.portfolioId)) {
      grouped.set(item.portfolioId, []);
    }
    grouped.get(item.portfolioId)?.push(vm);
  }

  const summary = portfolios.map((portfolio) => {
    const funds = grouped.get(portfolio.id) ?? [];
    const totalAmount = Number(funds.reduce((sum, item) => sum + item.holdingAmount, 0).toFixed(2));
    const totalProfitAmount = Number(funds.reduce((sum, item) => sum + item.totalProfitAmount, 0).toFixed(2));
    const totalProfitPct = totalAmount > 0 ? Number((totalProfitAmount / totalAmount).toFixed(6)) : 0;

    const weightedIntradayAmount = funds.reduce((sum, item) => {
      if (typeof item.estimateChangePct !== "number") {
        return sum;
      }
      return sum + item.holdingAmount * item.estimateChangePct;
    }, 0);
    const intradayEstimatePct = totalAmount > 0 ? Number((weightedIntradayAmount / totalAmount).toFixed(6)) : 0;

    return {
      id: portfolio.id,
      name: portfolio.name,
      type: portfolio.type,
      fundCount: funds.length,
      totalAmount,
      totalProfitAmount,
      totalProfitPct,
      totalProfitDisplay: `${formatSignedAmount(totalProfitAmount)} / ${formatSignedPct(totalProfitPct)}`,
      intradayEstimatePct
    } satisfies PortfolioSummary;
  });

  return {
    portfolios: summary,
    estimateMap,
    fundStateMap
  };
}

export function registerWatchlistRoutes(app: FastifyInstance, deps: RegisterWatchlistRoutesDeps): void {
  app.get("/v1/portfolios", async () => {
    const result = await buildPortfolioSummaries(deps.store, deps.service);
    return {
      portfolios: result.portfolios
    };
  });

  app.post("/v1/portfolios", async (request, reply) => {
    const body = request.body as { name?: unknown; type?: unknown };
    const name = parsePortfolioName(body?.name);
    const type = parsePortfolioType(body?.type);

    try {
      const created = await deps.store.createPortfolio(name, type);
      reply.code(201);
      return {
        portfolio: {
          id: created.id,
          name: created.name,
          type: created.type,
          fundCount: 0,
          totalAmount: 0,
          totalProfitAmount: 0,
          totalProfitPct: 0,
          totalProfitDisplay: "0.00 / 0.00%",
          intradayEstimatePct: 0
        } satisfies PortfolioSummary
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new AppError(ERROR_CODES.DUPLICATE_PORTFOLIO_NAME, "portfolio name already exists", 409);
      }
      throw error;
    }
  });

  app.patch("/v1/portfolios/:portfolioId", async (request) => {
    const params = request.params as { portfolioId: string };
    ensurePortfolioId(params.portfolioId);
    const body = request.body as { name?: unknown };
    const name = parsePortfolioName(body?.name);

    await ensurePortfolioOrThrow(deps.store, params.portfolioId);

    try {
      const updated = await deps.store.renamePortfolio(params.portfolioId, name);
      return { updated };
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new AppError(ERROR_CODES.DUPLICATE_PORTFOLIO_NAME, "portfolio name already exists", 409);
      }
      throw error;
    }
  });

  app.delete("/v1/portfolios/:portfolioId", async (request) => {
    const params = request.params as { portfolioId: string };
    ensurePortfolioId(params.portfolioId);
    const removed = await deps.store.deletePortfolio(params.portfolioId);
    return { removed };
  });

  app.get("/v1/portfolios/:portfolioId/funds", async (request) => {
    const params = request.params as { portfolioId: string };
    ensurePortfolioId(params.portfolioId);

    const portfolio = await ensurePortfolioOrThrow(deps.store, params.portfolioId);
    const items = await deps.store.listPortfolioFunds(params.portfolioId);
    const fundCodes = items.map((item) => item.fundCode);

    await syncFundStateWithLatestReturns(deps.store, deps.service, fundCodes);

    const [estimateMap, fundStates] = await Promise.all([
      chunkGetEstimates(deps.service, fundCodes),
      deps.store.listFundStatesByCodes(fundCodes)
    ]);

    const totalAmount = items.reduce((sum, item) => sum + item.holdingAmount, 0);

    const funds = items.map((item) => {
      const estimate = estimateMap.get(item.fundCode);
      const totalChangePct = fundStates.get(item.fundCode)?.totalChangePct ?? 0;
      const totalProfitAmount = Number((item.holdingAmount * totalChangePct).toFixed(2));
      const actualRatio = totalAmount > 0 ? Number((item.holdingAmount / totalAmount).toFixed(6)) : 0;
      return {
        portfolioId: item.portfolioId,
        portfolioName: item.portfolioName,
        portfolioType: item.portfolioType,
        fundCode: item.fundCode,
        displayOrder: item.displayOrder,
        fundName: estimate?.fundName,
        holdingAmount: item.holdingAmount,
        estimateChangePct: estimate?.estimateChangePct,
        totalChangePct,
        intradayAmount:
          typeof estimate?.estimateChangePct === "number"
            ? Number((item.holdingAmount * estimate.estimateChangePct).toFixed(2))
            : undefined,
        totalProfitAmount,
        trend: trendFromEstimate(estimate?.estimateChangePct),
        plannedRatio: portfolio.type === "RATIO" ? item.plannedRatio : undefined,
        actualRatio: portfolio.type === "RATIO" ? actualRatio : undefined
      } satisfies PortfolioFundItem;
    });

    return {
      portfolio,
      funds
    };
  });

  app.patch("/v1/portfolios/:portfolioId/funds/order", async (request) => {
    const params = request.params as { portfolioId: string };
    ensurePortfolioId(params.portfolioId);

    const body = request.body as { fundCodes?: unknown };
    const fundCodes = parseFundCodes(body?.fundCodes);

    await ensurePortfolioOrThrow(deps.store, params.portfolioId);
    const isValidSet = await deps.store.validatePortfolioFundSet(params.portfolioId, fundCodes);
    if (!isValidSet) {
      throw new AppError(
        ERROR_CODES.INVALID_PORTFOLIO,
        "fundCodes must include all and only funds in the target portfolio",
        400
      );
    }

    await deps.store.reorderPortfolioFunds(params.portfolioId, fundCodes);
    return {
      updated: true
    };
  });

  app.post("/v1/portfolios/:portfolioId/funds", async (request, reply) => {
    const params = request.params as { portfolioId: string };
    ensurePortfolioId(params.portfolioId);

    const body = request.body as {
      fundCode?: unknown;
      holdingAmount?: unknown;
      plannedRatio?: unknown;
    };

    const fundCode = typeof body?.fundCode === "string" ? body.fundCode.trim() : "";
    ensureFundCode(fundCode);
    const holdingAmount = parseHoldingAmount(body?.holdingAmount, true) ?? 0;

    const portfolio = await ensurePortfolioOrThrow(deps.store, params.portfolioId);
    const existing = await deps.store.getPortfolioFund(params.portfolioId, fundCode);

    let nextPlannedRatio: number | undefined;
    if (portfolio.type === "RATIO") {
      const required = !existing;
      nextPlannedRatio = parsePlannedRatio(body?.plannedRatio, required) ?? existing?.plannedRatio;
      if (typeof nextPlannedRatio !== "number") {
        throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "plannedRatio is required for ratio portfolio", 400);
      }

      const currentSumWithoutFund = await deps.store.sumPlannedRatio(params.portfolioId, fundCode);
      if (currentSumWithoutFund + nextPlannedRatio > 1.0000001) {
        throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "plannedRatio sum must be <= 1", 400);
      }
    }

    await deps.store.upsertPortfolioFund({
      portfolioId: params.portfolioId,
      fundCode,
      holdingAmount,
      plannedRatio: portfolio.type === "RATIO" ? nextPlannedRatio : undefined
    });

    reply.code(existing ? 200 : 201);
    return {
      portfolioId: params.portfolioId,
      fundCode,
      holdingAmount,
      plannedRatio: portfolio.type === "RATIO" ? nextPlannedRatio : undefined
    };
  });

  app.patch("/v1/portfolios/:portfolioId/funds/:fundCode", async (request) => {
    const params = request.params as { portfolioId: string; fundCode: string };
    ensurePortfolioId(params.portfolioId);
    ensureFundCode(params.fundCode);

    const body = request.body as {
      holdingAmount?: unknown;
      plannedRatio?: unknown;
    };

    const hasHoldingAmount = body?.holdingAmount !== undefined;
    const hasPlannedRatio = body?.plannedRatio !== undefined;
    if (!hasHoldingAmount && !hasPlannedRatio) {
      throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "holdingAmount or plannedRatio is required", 400);
    }

    const portfolio = await ensurePortfolioOrThrow(deps.store, params.portfolioId);
    const existing = await deps.store.getPortfolioFund(params.portfolioId, params.fundCode);
    if (!existing) {
      throw new AppError(ERROR_CODES.PORTFOLIO_FUND_NOT_FOUND, "portfolio fund not found", 404);
    }

    const holdingAmount = parseHoldingAmount(body?.holdingAmount, false);
    let plannedRatio = parsePlannedRatio(body?.plannedRatio, false);

    if (portfolio.type === "RATIO") {
      const nextPlannedRatio = plannedRatio ?? existing.plannedRatio;
      if (typeof nextPlannedRatio !== "number") {
        throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "plannedRatio is required for ratio portfolio", 400);
      }

      const currentSumWithoutFund = await deps.store.sumPlannedRatio(params.portfolioId, params.fundCode);
      if (currentSumWithoutFund + nextPlannedRatio > 1.0000001) {
        throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "plannedRatio sum must be <= 1", 400);
      }

      plannedRatio = nextPlannedRatio;
    } else {
      plannedRatio = undefined;
    }

    const input: UpdatePortfolioFundInput = {
      portfolioId: params.portfolioId,
      fundCode: params.fundCode,
      holdingAmount,
      plannedRatio
    };

    const updated = await deps.store.updatePortfolioFund(input);
    return {
      updated
    };
  });

  app.delete("/v1/portfolios/:portfolioId/funds/:fundCode", async (request) => {
    const params = request.params as { portfolioId: string; fundCode: string };
    ensurePortfolioId(params.portfolioId);
    ensureFundCode(params.fundCode);

    const removed = await deps.store.removePortfolioFund(params.portfolioId, params.fundCode);
    return { removed };
  });

  app.get("/v1/funds/flat", async (request) => {
    const query = request.query as FlatQuery;
    const expand = query.expand === "expanded" ? "expanded" : "dedup";
    const sortOrder = query.sortOrder === "asc" || query.sortOrder === "desc" ? query.sortOrder : "default";

    const portfolioFunds = await deps.store.listAllPortfolioFunds();
    const fundCodes = Array.from(new Set(portfolioFunds.map((item) => item.fundCode)));

    await syncFundStateWithLatestReturns(deps.store, deps.service, fundCodes);

    const [estimateMap, fundStates] = await Promise.all([
      chunkGetEstimates(deps.service, fundCodes),
      deps.store.listFundStatesByCodes(fundCodes)
    ]);

    const totalAmountMap = new Map<string, number>();
    for (const row of portfolioFunds) {
      totalAmountMap.set(row.portfolioId, (totalAmountMap.get(row.portfolioId) ?? 0) + row.holdingAmount);
    }

    if (expand === "expanded") {
      const expandedRows = portfolioFunds.map((row) => {
        const estimate = estimateMap.get(row.fundCode);
        const totalChangePct = fundStates.get(row.fundCode)?.totalChangePct ?? 0;
        const totalAmount = totalAmountMap.get(row.portfolioId) ?? 0;
        return {
          fundCode: row.fundCode,
          fundName: estimate?.fundName,
          holdingAmount: row.holdingAmount,
          estimateChangePct: estimate?.estimateChangePct,
          totalChangePct,
          trend: trendFromEstimate(estimate?.estimateChangePct),
          portfolioCount: 1,
          portfolioNames: [row.portfolioName],
          portfolioId: row.portfolioId,
          portfolioName: row.portfolioName,
          portfolioType: row.portfolioType,
          plannedRatio: row.portfolioType === "RATIO" ? row.plannedRatio : undefined,
          actualRatio: row.portfolioType === "RATIO" && totalAmount > 0 ? Number((row.holdingAmount / totalAmount).toFixed(6)) : undefined
        } satisfies FlatFundItem;
      });

      return {
        items: sortOrder === "default" ? expandedRows : sortByEstimate(expandedRows, sortOrder),
        expand,
        sortOrder
      };
    }

    const grouped = new Map<string, FlatFundItem>();
    for (const row of portfolioFunds) {
      const estimate = estimateMap.get(row.fundCode);
      const totalChangePct = fundStates.get(row.fundCode)?.totalChangePct ?? 0;

      if (!grouped.has(row.fundCode)) {
        grouped.set(row.fundCode, {
          fundCode: row.fundCode,
          fundName: estimate?.fundName,
          holdingAmount: 0,
          estimateChangePct: estimate?.estimateChangePct,
          totalChangePct,
          trend: trendFromEstimate(estimate?.estimateChangePct),
          portfolioCount: 0,
          portfolioNames: []
        });
      }

      const current = grouped.get(row.fundCode);
      if (!current) {
        continue;
      }

      current.holdingAmount = Number((current.holdingAmount + row.holdingAmount).toFixed(2));
      if (!current.portfolioNames.includes(row.portfolioName)) {
        current.portfolioNames.push(row.portfolioName);
      }
      current.portfolioCount = current.portfolioNames.length;
    }

    return {
      items: sortOrder === "default" ? Array.from(grouped.values()) : sortByEstimate(Array.from(grouped.values()), sortOrder),
      expand,
      sortOrder
    };
  });
}

export function createWatchlistStore(dbPath: string): SqliteWatchlistStore {
  return new SqliteWatchlistStore(dbPath);
}
