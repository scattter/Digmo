import { ERROR_CODES } from "@digmo/shared";
import { FastifyInstance } from "fastify";
import { ValuationService } from "../modules/valuation/service.js";
import { AppError } from "../utils/app-error.js";

interface RegisterFundRoutesDeps {
  service: ValuationService;
}

function ensureFundCode(fundCode: string): void {
  if (!/^\d{6}$/.test(fundCode)) {
    throw new AppError(ERROR_CODES.INVALID_FUND_CODES, "fundCode must be a 6-digit string", 400);
  }
}

export function registerFundRoutes(app: FastifyInstance, deps: RegisterFundRoutesDeps): void {
  app.get("/v1/funds/:fundCode/estimate", async (request) => {
    const params = request.params as { fundCode: string };
    ensureFundCode(params.fundCode);
    return deps.service.getOrComputeEstimate(params.fundCode);
  });

  app.post("/v1/funds/estimate/batch", async (request) => {
    const body = request.body as { fundCodes?: string[] };
    const fundCodes = body?.fundCodes ?? [];

    if (!Array.isArray(fundCodes) || fundCodes.length === 0 || fundCodes.length > 50) {
      throw new AppError(ERROR_CODES.INVALID_FUND_CODES, "fundCodes length must be between 1 and 50", 400);
    }

    for (const code of fundCodes) {
      ensureFundCode(code);
    }

    return deps.service.getBatchEstimates(fundCodes);
  });
}
