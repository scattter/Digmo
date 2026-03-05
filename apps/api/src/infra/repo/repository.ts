import {
  FundEstimateSnapshot,
  FundProfile,
  HoldingSnapshot,
  JobRunLog,
  MarketQuote,
  NavRecord,
  ValuationTaskStatus
} from "@digmo/shared";

export interface StoredEstimate extends FundEstimateSnapshot {
  estimateTimeBucket: string;
  inputs: {
    quoteCodes: string[];
    quoteTime: string;
    fitScore: number;
    holdingReportDate?: string;
    recentError?: number;
  };
}

export interface Repository {
  saveFundProfile(profile: FundProfile): Promise<void>;
  getFundProfile(fundCode: string): Promise<FundProfile | undefined>;
  listFundCodes(): Promise<string[]>;

  saveNavRecord(record: NavRecord): Promise<void>;
  saveNavRecords(records: NavRecord[]): Promise<void>;
  getLatestNavRecord(fundCode: string): Promise<NavRecord | undefined>;
  getRecentNavRecords(fundCode: string, limit: number): Promise<NavRecord[]>;

  saveHoldingSnapshot(snapshot: HoldingSnapshot): Promise<void>;
  getLatestHoldingSnapshot(fundCode: string): Promise<HoldingSnapshot | undefined>;

  saveQuotes(quotes: MarketQuote[]): Promise<void>;
  getLatestQuote(code: string): Promise<MarketQuote | undefined>;
  getLatestQuotes(codes: string[]): Promise<MarketQuote[]>;

  saveEstimate(snapshot: StoredEstimate): Promise<void>;
  getLatestEstimate(fundCode: string): Promise<StoredEstimate | undefined>;
  getLatestEstimates(fundCodes: string[]): Promise<StoredEstimate[]>;
  hasEstimateInBucket(fundCode: string, bucketIso: string): Promise<boolean>;

  startJobRun(jobName: "valuation_tick", startedAt: string): Promise<JobRunLog>;
  finishJobRun(
    jobRunId: string,
    endedAt: string,
    status: "SUCCESS" | "PARTIAL" | "FAILED",
    successCount: number,
    failCount: number,
    errors: Record<string, number>
  ): Promise<void>;
  getValuationTaskStatus(): Promise<ValuationTaskStatus>;
}
