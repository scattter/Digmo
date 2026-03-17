import { ASIA_SHANGHAI_TIMEZONE, ERROR_CODES, PortfolioType } from "@digmo/shared";
import { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import { DecisionStore } from "../infra/decision/sqlite-decision-store.js";
import { WatchlistStore } from "../infra/watchlist/sqlite-watchlist-store.js";
import { DecisionAIProvider, DecisionGenerationResult } from "../modules/decision/provider.js";
import { ValuationService } from "../modules/valuation/service.js";
import { AppError } from "../utils/app-error.js";
import { formatDate, nowInShanghai } from "../utils/time.js";

interface RegisterDecisionRoutesDeps {
  store: WatchlistStore;
  decisionStore: DecisionStore;
  service: ValuationService;
  provider: DecisionAIProvider;
  requireAuth: preHandlerHookHandler;
  timezone?: string;
}

const DECISION_OPERATION_HISTORY_LIMIT = 50;

function requireUserId(request: FastifyRequest): string {
  const userId = request.authUser?.id?.trim();
  if (!userId) {
    throw new AppError(ERROR_CODES.AUTH_REQUIRED, "authentication is required", 401);
  }
  return userId;
}

function ensurePortfolioId(portfolioId: string): void {
  if (!portfolioId.trim()) {
    throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "portfolioId is required", 400);
  }
}

function parseDocFormat(raw: unknown): "TEXT" | "MARKDOWN" {
  if (raw === "TEXT" || raw === "MARKDOWN") {
    return raw;
  }
  throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "format must be TEXT or MARKDOWN", 400);
}

function parseDocContent(raw: unknown): string {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) {
    throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "content is required", 400);
  }
  if (content.length > 30_000) {
    throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "content length must be <= 30000", 400);
  }
  return content;
}

function parseOptionalString(raw: unknown, maxLen: number): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  return value.slice(0, maxLen);
}

async function ensurePortfolioOrThrow(store: WatchlistStore, userId: string, portfolioId: string) {
  const portfolio = await store.getPortfolio(userId, portfolioId);
  if (!portfolio) {
    throw new AppError(ERROR_CODES.PORTFOLIO_NOT_FOUND, "portfolio not found", 404);
  }
  return portfolio;
}

function calcProfitPctByCost(holdingAmount: number, holdingProfitAmount: number): number {
  const cost = holdingAmount - holdingProfitAmount;
  if (cost <= 0) {
    return 0;
  }
  return Number((holdingProfitAmount / cost).toFixed(6));
}

function enforceActionFundScope(result: DecisionGenerationResult, fundCodeSet: Set<string>): DecisionGenerationResult {
  for (const action of result.actions) {
    if (!fundCodeSet.has(action.fundCode)) {
      throw new Error(`fund ${action.fundCode} is outside current portfolio`);
    }
    if (!Array.isArray(action.citations) || action.citations.length === 0) {
      throw new Error(`action ${action.fundCode} has no citations`);
    }
    for (const citation of action.citations) {
      if (!citation.title?.trim() || !citation.snippet?.trim()) {
        throw new Error(`action ${action.fundCode} has invalid citation`);
      }
    }
    if (action.riskLevel === "HIGH" && !action.requiresSecondConfirm) {
      action.requiresSecondConfirm = true;
    }
  }
  return result;
}

function toPromptSnapshot(input: {
  asOf: string;
  portfolio: {
    id: string;
    name: string;
    type: PortfolioType;
    funds: Array<{ fundCode: string; holdingAmount: number; estimateChangePct?: number }>;
  };
  docVersion: number;
}): string {
  return JSON.stringify(input);
}

export function registerDecisionRoutes(app: FastifyInstance, deps: RegisterDecisionRoutesDeps): void {
  const timezone = deps.timezone ?? ASIA_SHANGHAI_TIMEZONE;

  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", deps.requireAuth);

    protectedApp.put("/v1/portfolios/:portfolioId/decision-doc", async (request) => {
      const userId = requireUserId(request);
      const params = request.params as { portfolioId: string };
      ensurePortfolioId(params.portfolioId);
      await ensurePortfolioOrThrow(deps.store, userId, params.portfolioId);

      const body = request.body as {
        title?: unknown;
        content?: unknown;
        format?: unknown;
        sourceFileName?: unknown;
      };
      const title = parseOptionalString(body.title, 120);
      const content = parseDocContent(body.content);
      const format = parseDocFormat(body.format);
      const sourceFileName = parseOptionalString(body.sourceFileName, 260);

      const doc = await deps.decisionStore.upsertDecisionDoc(userId, params.portfolioId, {
        ...(title ? { title } : {}),
        format,
        content,
        ...(sourceFileName ? { sourceFileName } : {})
      });

      return { doc };
    });

    protectedApp.get("/v1/portfolios/:portfolioId/decision-doc", async (request) => {
      const userId = requireUserId(request);
      const params = request.params as { portfolioId: string };
      ensurePortfolioId(params.portfolioId);
      await ensurePortfolioOrThrow(deps.store, userId, params.portfolioId);

      const doc = await deps.decisionStore.getActiveDecisionDoc(userId, params.portfolioId);
      if (!doc) {
        throw new AppError(ERROR_CODES.DECISION_DOC_NOT_FOUND, "active decision doc not found", 404);
      }
      return { doc };
    });

    protectedApp.post("/v1/portfolios/:portfolioId/daily-decision:generate", async (request) => {
      const userId = requireUserId(request);
      const params = request.params as { portfolioId: string };
      ensurePortfolioId(params.portfolioId);
      const portfolio = await ensurePortfolioOrThrow(deps.store, userId, params.portfolioId);

      const activeDoc = await deps.decisionStore.getActiveDecisionDoc(userId, params.portfolioId);
      if (!activeDoc) {
        throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "active decision doc is required", 400);
      }

      const portfolioFunds = await deps.store.listPortfolioFunds(userId, params.portfolioId);
      if (portfolioFunds.length === 0) {
        throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "portfolio has no funds", 400);
      }
      const operationHistory = await deps.store.listPositionOperations(userId, params.portfolioId, {
        limit: DECISION_OPERATION_HISTORY_LIMIT
      });

      const fundCodes = portfolioFunds.map((item) => item.fundCode);
      const estimateResp = await deps.service.getBatchEstimates(fundCodes);
      const estimateMap = new Map(estimateResp.data.map((item) => [item.fundCode, item]));
      const totalAmount = Number(portfolioFunds.reduce((sum, item) => sum + item.holdingAmount, 0).toFixed(2));
      const totalProfitAmount = Number(portfolioFunds.reduce((sum, item) => sum + item.holdingProfitAmount, 0).toFixed(2));
      const dailyProfitAmount = Number(
        portfolioFunds
          .reduce((sum, item) => sum + item.holdingAmount * (estimateMap.get(item.fundCode)?.estimateChangePct ?? 0), 0)
          .toFixed(2)
      );
      const dailyProfitPct = totalAmount > 0 ? Number((dailyProfitAmount / totalAmount).toFixed(6)) : 0;

      const asOf = nowInShanghai().toISOString();
      const input = {
        asOf,
        timezone,
        portfolio: {
          id: portfolio.id,
          name: portfolio.name,
          type: portfolio.type,
          totalAmount,
          totalProfitAmount,
          dailyProfitPct,
          funds: portfolioFunds.map((item) => {
            const estimate = estimateMap.get(item.fundCode);
            const holdingProfitAmount = item.holdingProfitAmount;
            return {
              fundCode: item.fundCode,
              fundName: estimate?.fundName,
              holdingAmount: item.holdingAmount,
              holdingProfitAmount,
              estimateChangePct: estimate?.estimateChangePct,
              dailyProfitPct: estimate?.estimateChangePct,
              officialNavDate: estimate?.baseNavDate,
              ...(typeof item.plannedRatio === "number" ? { plannedRatio: item.plannedRatio } : {}),
              ...(portfolio.type === "RATIO" && totalAmount > 0
                ? { actualRatio: Number((item.holdingAmount / totalAmount).toFixed(6)) }
                : {}),
              holdingProfitPct: calcProfitPctByCost(item.holdingAmount, holdingProfitAmount)
            };
          })
        },
        operationHistory: operationHistory.map((item) => ({
          createdAt: item.createdAt,
          fundCode: item.fundCode,
          operationType: item.operationType,
          amount: item.amount,
          beforeHoldingAmount: item.beforeHoldingAmount,
          afterHoldingAmount: item.afterHoldingAmount,
          beforeHoldingProfitAmount: item.beforeHoldingProfitAmount,
          afterHoldingProfitAmount: item.afterHoldingProfitAmount,
          ...(item.bindSuggestion ? { bindSuggestion: item.bindSuggestion } : {})
        })),
        decisionDoc: {
          title: activeDoc.title,
          format: activeDoc.format,
          content: activeDoc.content,
          version: activeDoc.version
        }
      };

      const startedAt = Date.now();
      try {
        const generated = await deps.provider.generateDailyDecision(input);
        const scoped = enforceActionFundScope(generated, new Set(fundCodes));
        const latencyMs = Date.now() - startedAt;
        const decision = await deps.decisionStore.saveDecisionRun({
          userId,
          portfolioId: params.portfolioId,
          tradeDate: formatDate(nowInShanghai()),
          summary: scoped.summary,
          overallRiskLevel: scoped.overallRiskLevel,
          provider: deps.provider.name,
          model: deps.provider.model,
          status: "SUCCESS",
          latencyMs,
          usage: scoped.usage,
          rawResponse: scoped.rawResponse,
          promptSnapshotJson: toPromptSnapshot({
            asOf,
            portfolio: {
              id: portfolio.id,
              name: portfolio.name,
              type: portfolio.type,
              funds: input.portfolio.funds.map((item) => ({
                fundCode: item.fundCode,
                holdingAmount: item.holdingAmount,
                estimateChangePct: item.estimateChangePct
              }))
            },
            docVersion: activeDoc.version
          }),
          actions: scoped.actions
        });

        return { decision };
      } catch (error) {
        const latencyMs = Date.now() - startedAt;
        const message = error instanceof Error ? error.message : "decision generation failed";
        await deps.decisionStore.saveDecisionRun({
          userId,
          portfolioId: params.portfolioId,
          tradeDate: formatDate(nowInShanghai()),
          summary: "本次建议生成失败，请重试",
          overallRiskLevel: "HIGH",
          provider: deps.provider.name,
          model: deps.provider.model,
          status: "FAILED",
          errorMessage: message,
          latencyMs,
          actions: [],
          promptSnapshotJson: toPromptSnapshot({
            asOf,
            portfolio: {
              id: portfolio.id,
              name: portfolio.name,
              type: portfolio.type,
              funds: input.portfolio.funds.map((item) => ({
                fundCode: item.fundCode,
                holdingAmount: item.holdingAmount,
                estimateChangePct: item.estimateChangePct
              }))
            },
            docVersion: activeDoc.version
          })
        });
        throw new AppError(ERROR_CODES.DECISION_GENERATION_FAILED, "decision generation failed, please retry", 502, {
          reason: message
        });
      }
    });

    protectedApp.get("/v1/portfolios/:portfolioId/daily-decision/latest", async (request) => {
      const userId = requireUserId(request);
      const params = request.params as { portfolioId: string };
      ensurePortfolioId(params.portfolioId);
      await ensurePortfolioOrThrow(deps.store, userId, params.portfolioId);
      const decision = await deps.decisionStore.getLatestDecision(userId, params.portfolioId);
      return { decision: decision ?? null };
    });

    protectedApp.get("/v1/portfolios/:portfolioId/daily-decision/history", async (request) => {
      const userId = requireUserId(request);
      const params = request.params as { portfolioId: string };
      ensurePortfolioId(params.portfolioId);
      await ensurePortfolioOrThrow(deps.store, userId, params.portfolioId);
      const query = request.query as { limit?: unknown };
      const rawLimit = typeof query.limit === "string" ? Number(query.limit) : Number(query.limit ?? 10);
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 10;
      const items = await deps.decisionStore.listDecisionHistory(userId, params.portfolioId, limit);
      return { items };
    });
  });
}
