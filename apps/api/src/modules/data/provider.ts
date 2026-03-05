import { FundProfile, HoldingSnapshot, MarketQuote, NavRecord } from "@digmo/shared";

export interface HistoricalReturn {
  date: string;
  changePct: number;
}

export interface FundDataProvider {
  listTargetFundCodes(): Promise<string[]>;
  getFundProfile(fundCode: string): Promise<FundProfile | undefined>;
  getLatestNavRecord(fundCode: string): Promise<NavRecord | undefined>;
  getRecentNavRecords(fundCode: string, limit: number): Promise<NavRecord[]>;
  getHoldingSnapshot(fundCode: string): Promise<HoldingSnapshot | undefined>;
  getLatestMarketQuotes(): Promise<MarketQuote[]>;
  getHistoricalIndexReturns(indexCode: string, limit: number): Promise<HistoricalReturn[]>;
}
