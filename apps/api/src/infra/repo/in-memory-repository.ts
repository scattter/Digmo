import {
  FundProfile,
  HoldingSnapshot,
  JobRunLog,
  MarketQuote,
  NavRecord,
  ValuationTaskStatus
} from "@digmo/shared";
import { randomUUID } from "node:crypto";
import { Repository, StoredEstimate } from "./repository.js";

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export class InMemoryRepository implements Repository {
  private readonly profiles = new Map<string, FundProfile>();

  private readonly navRecords = new Map<string, NavRecord[]>();

  private readonly holdings = new Map<string, HoldingSnapshot>();

  private readonly quotes = new Map<string, MarketQuote>();

  private readonly estimates = new Map<string, StoredEstimate[]>();

  private readonly jobLogs: JobRunLog[] = [];

  async saveFundProfile(profile: FundProfile): Promise<void> {
    this.profiles.set(profile.fundCode, profile);
  }

  async getFundProfile(fundCode: string): Promise<FundProfile | undefined> {
    return this.profiles.get(fundCode);
  }

  async listFundCodes(): Promise<string[]> {
    return [...this.profiles.keys()];
  }

  async saveNavRecord(record: NavRecord): Promise<void> {
    const existing = this.navRecords.get(record.fundCode) ?? [];
    const merged = [...existing.filter((item) => item.navDate !== record.navDate), record].sort((a, b) =>
      a.navDate.localeCompare(b.navDate)
    );
    this.navRecords.set(record.fundCode, merged);
  }

  async saveNavRecords(records: NavRecord[]): Promise<void> {
    await Promise.all(records.map((record) => this.saveNavRecord(record)));
  }

  async getLatestNavRecord(fundCode: string): Promise<NavRecord | undefined> {
    const records = this.navRecords.get(fundCode);
    return records?.at(-1);
  }

  async getRecentNavRecords(fundCode: string, limit: number): Promise<NavRecord[]> {
    const records = this.navRecords.get(fundCode) ?? [];
    return records.slice(Math.max(0, records.length - limit));
  }

  async saveHoldingSnapshot(snapshot: HoldingSnapshot): Promise<void> {
    this.holdings.set(snapshot.fundCode, snapshot);
  }

  async getLatestHoldingSnapshot(fundCode: string): Promise<HoldingSnapshot | undefined> {
    return this.holdings.get(fundCode);
  }

  async saveQuotes(quotes: MarketQuote[]): Promise<void> {
    for (const quote of quotes) {
      this.quotes.set(quote.code, quote);
    }
  }

  async getLatestQuote(code: string): Promise<MarketQuote | undefined> {
    return this.quotes.get(code);
  }

  async getLatestQuotes(codes: string[]): Promise<MarketQuote[]> {
    return codes
      .map((code) => this.quotes.get(code))
      .filter((quote): quote is MarketQuote => Boolean(quote));
  }

  async saveEstimate(snapshot: StoredEstimate): Promise<void> {
    const existing = this.estimates.get(snapshot.fundCode) ?? [];
    const filtered = existing.filter((item) => item.estimateTimeBucket !== snapshot.estimateTimeBucket);
    filtered.push({
      ...snapshot,
      estimateNav: round(snapshot.estimateNav),
      estimateChangePct: round(snapshot.estimateChangePct)
    });
    filtered.sort((a, b) => a.estimateTime.localeCompare(b.estimateTime));
    this.estimates.set(snapshot.fundCode, filtered);
  }

  async getLatestEstimate(fundCode: string): Promise<StoredEstimate | undefined> {
    return this.estimates.get(fundCode)?.at(-1);
  }

  async getLatestEstimates(fundCodes: string[]): Promise<StoredEstimate[]> {
    const data = await Promise.all(fundCodes.map((code) => this.getLatestEstimate(code)));
    return data.filter((item): item is StoredEstimate => Boolean(item));
  }

  async hasEstimateInBucket(fundCode: string, bucketIso: string): Promise<boolean> {
    const latest = await this.getLatestEstimate(fundCode);
    return latest?.estimateTimeBucket === bucketIso;
  }

  async startJobRun(jobName: "valuation_tick", startedAt: string): Promise<JobRunLog> {
    const log: JobRunLog = {
      id: randomUUID(),
      jobName,
      startedAt,
      status: "SUCCESS",
      successCount: 0,
      failCount: 0,
      errors: {}
    };
    this.jobLogs.unshift(log);
    if (this.jobLogs.length > 200) {
      this.jobLogs.pop();
    }
    return log;
  }

  async finishJobRun(
    jobRunId: string,
    endedAt: string,
    status: "SUCCESS" | "PARTIAL" | "FAILED",
    successCount: number,
    failCount: number,
    errors: Record<string, number>
  ): Promise<void> {
    const target = this.jobLogs.find((job) => job.id === jobRunId);
    if (!target) {
      return;
    }

    target.endedAt = endedAt;
    target.status = status;
    target.successCount = successCount;
    target.failCount = failCount;
    target.errors = errors;
  }

  async getValuationTaskStatus(): Promise<ValuationTaskStatus> {
    const latest = this.jobLogs[0];
    const recent = this.jobLogs.slice(0, 20);

    const totalSuccess = recent.reduce((acc, item) => acc + item.successCount, 0);
    const totalFail = recent.reduce((acc, item) => acc + item.failCount, 0);
    const total = totalSuccess + totalFail;

    const failuresMap = new Map<string, number>();
    for (const item of recent) {
      for (const [reason, count] of Object.entries(item.errors)) {
        failuresMap.set(reason, (failuresMap.get(reason) ?? 0) + count);
      }
    }

    return {
      jobName: "valuation_tick",
      lastStartedAt: latest?.startedAt,
      lastEndedAt: latest?.endedAt,
      lastStatus: latest?.status,
      lastSuccessCount: latest?.successCount ?? 0,
      lastFailCount: latest?.failCount ?? 0,
      successRate: total === 0 ? 0 : Number(((totalSuccess / total) * 100).toFixed(2)),
      failures: [...failuresMap.entries()].map(([reason, count]) => ({ reason, count }))
    };
  }
}
