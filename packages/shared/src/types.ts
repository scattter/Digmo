export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type ValuationMethod = "FUND_GZ_DIRECT";

export interface FundEstimateSnapshot {
  fundCode: string;
  fundName: string;
  officialNav: number;
  officialDailyReturn?: number;
  estimateNav: number;
  estimateChangePct: number;
  baseNavDate: string;
  estimateTime: string;
  confidenceLevel: ConfidenceLevel;
  confidenceScore: number;
  method: ValuationMethod;
  inputsStalenessSec: number;
  holdingReportDate?: string;
  topHoldings: Array<{
    code: string;
    name: string;
    ratio: number;
    latestPrice?: number;
    changePct?: number;
    marketCap?: number;
    floatMarketCap?: number;
    source?: string;
  }>;
  disclaimer: string;
}

export interface BatchEstimateRequest {
  fundCodes: string[];
}

export interface BatchEstimateResponse {
  data: FundEstimateSnapshot[];
  partialFailed: string[];
}

export interface TaskFailureSummary {
  reason: string;
  count: number;
}

export interface ValuationTaskStatus {
  jobName: "valuation_tick";
  lastStartedAt?: string;
  lastEndedAt?: string;
  lastStatus?: "SUCCESS" | "PARTIAL" | "FAILED";
  lastSuccessCount: number;
  lastFailCount: number;
  successRate: number;
  failures: TaskFailureSummary[];
}

export interface HealthResponse {
  status: "ok";
  timestamp: string;
  timezone: string;
}

export interface FundProfile {
  fundCode: string;
  fundName: string;
  fundType: string;
  indexCode?: string;
}

export interface NavRecord {
  fundCode: string;
  navDate: string;
  nav: number;
  dailyReturn: number;
}

export interface HoldingSnapshot {
  fundCode: string;
  reportDate: string;
  stockRatio: number;
  bondRatio: number;
  cashRatio: number;
  holdings: Array<{
    code: string;
    name: string;
    ratio: number;
  }>;
}

export interface MarketQuote {
  code: string;
  name: string;
  quoteDate: string;
  quoteTime: string;
  changePct: number;
  source: string;
}

export interface JobRunLog {
  id: string;
  jobName: "valuation_tick";
  startedAt: string;
  endedAt?: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  successCount: number;
  failCount: number;
  errors: Record<string, number>;
}

export type UserRole = "admin" | "user";

export type UserStatus = "active" | "disabled";

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: AuthUser;
}

export type PortfolioType = "FREE" | "RATIO";
export type PortfolioShareValidity = "SEVEN_DAYS" | "PERMANENT";

export type TrendType = "UP" | "DOWN" | "FLAT";

export interface Portfolio {
  id: string;
  name: string;
  type: PortfolioType;
  totalAsset?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSummary {
  id: string;
  name: string;
  type: PortfolioType;
  fundCount: number;
  totalAmount: number;
  totalAsset?: number;
  cashAmount?: number;
  cashRatio?: number;
  totalProfitAmount: number;
  totalProfitPct: number;
  totalProfitDisplay: string;
  dailyProfitPct?: number;
  allFundsDailyUpdated: boolean;
  intradayEstimatePct?: number;
}

export interface PortfolioShareResult {
  shareCode: string;
  expiresAt: string | null;
  hasPassword: boolean;
}

export type DecisionAiMode = "responses" | "chat_completions";

export interface UserDecisionAiConfigSummary {
  baseUrl: string;
  model: string;
  mode: DecisionAiMode;
  hasApiKey: boolean;
  maskedApiKey?: string;
  updatedAt: string;
}

export interface ImportPortfolioByShareCodeResult {
  portfolio: PortfolioSummary;
  importedFundCount: number;
}

export interface PortfolioFundItem {
  portfolioId: string;
  portfolioName: string;
  portfolioType: PortfolioType;
  fundCode: string;
  displayOrder: number;
  fundName?: string;
  holdingAmount: number;
  estimateChangePct?: number;
  totalChangePct: number;
  intradayAmount?: number;
  totalProfitAmount: number;
  holdingProfitAmount: number;
  holdingProfitPct: number;
  dailyProfitAmount?: number;
  dailyProfitPct?: number;
  dailyProfitOfficialUpdated: boolean;
  trend: TrendType;
  plannedRatio?: number;
  actualRatio?: number;
}

export interface FlatFundItem {
  fundCode: string;
  fundName?: string;
  holdingAmount: number;
  estimateChangePct?: number;
  totalChangePct: number;
  trend: TrendType;
  portfolioCount: number;
  portfolioNames: string[];
  portfolioId?: string;
  portfolioName?: string;
  portfolioType?: PortfolioType;
  plannedRatio?: number;
  actualRatio?: number;
}

export type DecisionDocFormat = "TEXT" | "MARKDOWN";

export type DecisionActionType = "BUY" | "SELL" | "HOLD" | "REBALANCE";

export type DecisionRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type DecisionCitationSourceType =
  | "portfolio_doc"
  | "market_context"
  | "world_context"
  | "portfolio_data"
  | "other";

export interface DecisionCitation {
  title: string;
  url?: string;
  snippet: string;
  sourceType: DecisionCitationSourceType;
}

export interface PortfolioDecisionDoc {
  id: string;
  portfolioId: string;
  version: number;
  title?: string;
  format: DecisionDocFormat;
  content: string;
  sourceFileName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyDecision {
  id: string;
  portfolioId: string;
  tradeDate: string;
  summary: string;
  provider: string;
  model: string;
  status: "SUCCESS" | "FAILED";
  errorMessage?: string;
  latencyMs: number;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  createdAt: string;
}

export type PositionOperationType = "INCREASE" | "DECREASE";

export interface PositionOperationRecord {
  id: string;
  portfolioId: string;
  fundCode: string;
  operationType: PositionOperationType;
  amount: number;
  beforeHoldingAmount: number;
  afterHoldingAmount: number;
  beforeHoldingProfitAmount: number;
  afterHoldingProfitAmount: number;
  status: "PENDING" | "APPLIED";
  effectiveAt: string;
  appliedAt?: string;
  manualCanceledAt?: string;
  createdAt: string;
}

export interface PositionOperationDeleteResult {
  effect: "REMOVED" | "MARKED_MANUAL_CANCEL";
  operation?: PositionOperationRecord;
}
