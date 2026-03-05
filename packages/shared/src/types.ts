export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type ValuationMethod = "INDEX_TRACKING" | "BETA_PROXY";

export interface FundEstimateSnapshot {
  fundCode: string;
  fundName: string;
  officialNav: number;
  officialDailyReturn: number;
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

export type PortfolioType = "FREE" | "RATIO";

export type TrendType = "UP" | "DOWN" | "FLAT";

export interface Portfolio {
  id: string;
  name: string;
  type: PortfolioType;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSummary {
  id: string;
  name: string;
  type: PortfolioType;
  fundCount: number;
  totalAmount: number;
  totalProfitAmount: number;
  totalProfitPct: number;
  totalProfitDisplay: string;
  intradayEstimatePct: number;
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
