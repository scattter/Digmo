import { ERROR_CODES } from "@digmo/shared";
import { FastifyInstance } from "fastify";
import { WatchlistStore } from "../infra/watchlist/sqlite-watchlist-store";
import { ValuationService } from "../modules/valuation/service";
import { AppError } from "../utils/app-error";

interface RegisterWatchlistRoutesDeps {
  store: WatchlistStore;
  service: ValuationService;
}

function ensureFundCode(fundCode: string): void {
  if (!/^\d{6}$/.test(fundCode)) {
    throw new AppError(ERROR_CODES.INVALID_FUND_CODES, "fundCode must be a 6-digit string", 400);
  }
}

function parseHoldingAmount(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }

  const value = typeof raw === "string" ? Number(raw.trim()) : Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new AppError(ERROR_CODES.INVALID_FUND_CODES, "holdingAmount must be a non-negative number", 400);
  }

  return Number(value.toFixed(2));
}

export function registerWatchlistRoutes(app: FastifyInstance, deps: RegisterWatchlistRoutesDeps): void {
  app.get("/v1/watchlist/funds", async () => {
    const funds = await deps.store.listFunds();

    if (funds.length > 0) {
      for (const fund of funds) {
        try {
          const snapshot = await deps.service.getOrComputeEstimate(fund.fundCode);
          const createdDate = fund.createdAt?.slice(0, 10);
          const shouldRealignToLatestOfficial =
            typeof createdDate === "string" &&
            createdDate >= snapshot.baseNavDate &&
            Math.abs(fund.totalChangePct - snapshot.officialDailyReturn) > 0.000001;

          if (shouldRealignToLatestOfficial) {
            await deps.store.setOfficialReturnAnchor(fund.fundCode, snapshot.baseNavDate, snapshot.officialDailyReturn);
            continue;
          }

          await deps.store.accumulateOfficialReturn(fund.fundCode, snapshot.baseNavDate, snapshot.officialDailyReturn);
        } catch {
          // Ignore single-fund failures when syncing total change.
        }
      }
    }

    const latestFunds = await deps.store.listFunds();
    return {
      funds: latestFunds,
      fundCodes: latestFunds.map((item) => item.fundCode)
    };
  });

  app.post("/v1/watchlist/funds", async (request, reply) => {
    const body = request.body as { fundCode?: string; holdingAmount?: unknown };
    const fundCode = body?.fundCode?.trim() ?? "";
    ensureFundCode(fundCode);
    const holdingAmount = parseHoldingAmount(body?.holdingAmount);
    const existingFunds = await deps.store.listFunds();
    const existed = existingFunds.some((item) => item.fundCode === fundCode);

    await deps.store.addFund(fundCode, holdingAmount);
    if (!existed) {
      try {
        const snapshot = await deps.service.getOrComputeEstimate(fundCode);
        await deps.store.setOfficialReturnAnchor(fundCode, snapshot.baseNavDate, snapshot.officialDailyReturn);
      } catch {
        // Ignore anchor bootstrap failure; it will be retried on list endpoint.
      }
    }
    reply.code(201);
    return {
      fundCode,
      holdingAmount: holdingAmount ?? 0
    };
  });

  app.patch("/v1/watchlist/funds/:fundCode", async (request) => {
    const params = request.params as { fundCode: string };
    const body = request.body as { holdingAmount?: unknown };

    ensureFundCode(params.fundCode);
    const holdingAmount = parseHoldingAmount(body?.holdingAmount);
    if (holdingAmount === undefined) {
      throw new AppError(ERROR_CODES.INVALID_FUND_CODES, "holdingAmount is required", 400);
    }

    const updated = await deps.store.updateHoldingAmount(params.fundCode, holdingAmount);
    return {
      updated,
      fundCode: params.fundCode,
      holdingAmount
    };
  });

  app.delete("/v1/watchlist/funds/:fundCode", async (request) => {
    const params = request.params as { fundCode: string };
    ensureFundCode(params.fundCode);

    const removed = await deps.store.removeFundCode(params.fundCode);
    return {
      removed
    };
  });
}
