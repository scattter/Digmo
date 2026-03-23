import {
  DecisionDocFormat,
  PortfolioType,
} from "@digmo/shared";

export interface DecisionGenerationInput {
  asOf: string;
  timezone: string;
  portfolio: {
    id: string;
    name: string;
    type: PortfolioType;
    totalAmount: number;
    totalProfitAmount: number;
    dailyProfitPct: number;
    funds: Array<{
      fundCode: string;
      fundName?: string;
      holdingAmount: number;
      holdingProfitAmount: number;
      holdingProfitPct?: number;
      estimateChangePct?: number;
      dailyProfitPct?: number;
      officialNavDate?: string;
      plannedRatio?: number;
      actualRatio?: number;
    }>;
  };
  operationHistory: Array<{
    createdAt: string;
    fundCode: string;
    operationType: "INCREASE" | "DECREASE";
    amount: number;
    beforeHoldingAmount: number;
    afterHoldingAmount: number;
    beforeHoldingProfitAmount: number;
    afterHoldingProfitAmount: number;
  }>;
  decisionDoc: {
    title?: string;
    format: DecisionDocFormat;
    content: string;
    version: number;
  };
}

export interface DecisionGenerationUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface DecisionGenerationResult {
  summary: string;
  usage?: DecisionGenerationUsage;
  rawResponse?: string;
}

export interface DecisionAIProvider {
  readonly name: string;
  readonly model: string;
  generateDailyDecision(input: DecisionGenerationInput): Promise<DecisionGenerationResult>;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function validateDecisionGenerationResult(input: unknown): DecisionGenerationResult {
  const summaryFromString = asString(input);
  if (summaryFromString) {
    return { summary: summaryFromString };
  }

  if (!input || typeof input !== "object") {
    throw new Error("decision output must be plain text or an object with summary");
  }

  const summary = asString((input as Record<string, unknown>).summary);
  if (!summary) {
    throw new Error("decision summary is required");
  }

  return {
    summary
  };
}
