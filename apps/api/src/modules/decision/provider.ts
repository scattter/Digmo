import {
  DailyDecisionAction,
  DecisionCitationSourceType,
  DecisionDocFormat,
  DecisionRiskLevel,
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
      officialDailyReturn?: number;
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
    bindSuggestion?: {
      decisionId: string;
      actionOrder: number;
      actionType: DailyDecisionAction["actionType"];
      fundCode: string;
      fundName?: string;
      riskLevel: DecisionRiskLevel;
      rationale: string;
    };
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
  overallRiskLevel: DecisionRiskLevel;
  actions: DailyDecisionAction[];
  usage?: DecisionGenerationUsage;
  rawResponse?: string;
}

export interface DecisionAIProvider {
  readonly name: string;
  readonly model: string;
  generateDailyDecision(input: DecisionGenerationInput): Promise<DecisionGenerationResult>;
}

function isRiskLevel(value: unknown): value is DecisionRiskLevel {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH";
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function validateDecisionGenerationResult(input: unknown): DecisionGenerationResult {
  if (!input || typeof input !== "object") {
    throw new Error("decision output must be an object");
  }

  const raw = input as Record<string, unknown>;
  const summary = asString(raw.summary);
  if (!summary) {
    throw new Error("decision summary is required");
  }

  if (!isRiskLevel(raw.overallRiskLevel)) {
    throw new Error("overallRiskLevel must be LOW|MEDIUM|HIGH");
  }

  if (!Array.isArray(raw.actions) || raw.actions.length === 0) {
    throw new Error("actions must be a non-empty array");
  }

  const actions: DailyDecisionAction[] = raw.actions.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`actions[${index}] must be an object`);
    }
    const action = item as Record<string, unknown>;
    const actionType = asString(action.actionType);
    if (!actionType || !["BUY", "SELL", "HOLD", "REBALANCE"].includes(actionType)) {
      throw new Error(`actions[${index}].actionType is invalid`);
    }

    const fundCode = asString(action.fundCode);
    if (!fundCode || !/^\d{6}$/.test(fundCode)) {
      throw new Error(`actions[${index}].fundCode must be 6-digit`);
    }

    const rationale = asString(action.rationale);
    if (!rationale) {
      throw new Error(`actions[${index}].rationale is required`);
    }

    const triggerCondition = asString(action.triggerCondition);
    if (!triggerCondition) {
      throw new Error(`actions[${index}].triggerCondition is required`);
    }

    const validUntil = asString(action.validUntil);
    if (!validUntil || Number.isNaN(Date.parse(validUntil))) {
      throw new Error(`actions[${index}].validUntil must be ISO datetime`);
    }

    const confidence = toFiniteNumber(action.confidence);
    if (confidence === undefined || confidence < 0 || confidence > 1) {
      throw new Error(`actions[${index}].confidence must be 0~1`);
    }

    if (!isRiskLevel(action.riskLevel)) {
      throw new Error(`actions[${index}].riskLevel must be LOW|MEDIUM|HIGH`);
    }

    if (typeof action.requiresSecondConfirm !== "boolean") {
      throw new Error(`actions[${index}].requiresSecondConfirm must be boolean`);
    }

    if (!Array.isArray(action.citations) || action.citations.length === 0) {
      throw new Error(`actions[${index}].citations must be a non-empty array`);
    }

    const citations = action.citations.map((citationItem, citationIndex) => {
      if (!citationItem || typeof citationItem !== "object") {
        throw new Error(`actions[${index}].citations[${citationIndex}] must be an object`);
      }
      const citation = citationItem as Record<string, unknown>;
      const title = asString(citation.title);
      const snippet = asString(citation.snippet);
      const sourceType = asString(citation.sourceType);
      if (!title || !snippet || !sourceType) {
        throw new Error(`actions[${index}].citations[${citationIndex}] fields are required`);
      }
      if (!["portfolio_doc", "market_context", "world_context", "portfolio_data", "other"].includes(sourceType)) {
        throw new Error(`actions[${index}].citations[${citationIndex}].sourceType is invalid`);
      }
      const url = asString(citation.url);
      return {
        title,
        snippet,
        sourceType: sourceType as DecisionCitationSourceType,
        ...(url ? { url } : {})
      };
    });

    const targetPositionPct = toFiniteNumber(action.targetPositionPct);
    const targetAmount = toFiniteNumber(action.targetAmount);
    if (targetPositionPct !== undefined && (targetPositionPct < 0 || targetPositionPct > 1)) {
      throw new Error(`actions[${index}].targetPositionPct must be 0~1`);
    }
    if (targetAmount !== undefined && targetAmount < 0) {
      throw new Error(`actions[${index}].targetAmount must be >= 0`);
    }

    const fundName = asString(action.fundName);

    return {
      actionType: actionType as DailyDecisionAction["actionType"],
      fundCode,
      ...(fundName ? { fundName } : {}),
      rationale,
      ...(targetPositionPct !== undefined ? { targetPositionPct } : {}),
      ...(targetAmount !== undefined ? { targetAmount } : {}),
      triggerCondition,
      validUntil,
      confidence: Number(confidence.toFixed(4)),
      riskLevel: action.riskLevel,
      requiresSecondConfirm: action.requiresSecondConfirm,
      citations
    };
  });

  return {
    summary,
    overallRiskLevel: raw.overallRiskLevel,
    actions
  };
}
