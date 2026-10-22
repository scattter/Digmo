import { BatchEstimateResponse, DISCLAIMER, ERROR_CODES, FundEstimateSnapshot } from "@digmo/shared";
import { Cache } from "../../infra/cache/cache.js";
import { Repository, StoredEstimate } from "../../infra/repo/repository.js";
import { floorToBucketIso, getBucketSeconds, isSameShanghaiDay, nowInShanghai, secondsStaleness } from "../../utils/time.js";
import { AppError } from "../../utils/app-error.js";
import { FundDataProvider } from "../data/provider.js";
import { fetchSinaFundEstimate, RealtimeFundEstimate } from "../data/sina-fund-client.js";

const ESTIMATE_CACHE_TTL = 45;
const BATCH_CACHE_TTL = 20;
const BATCH_ESTIMATE_CONCURRENCY = 6;

interface ComputeOptions {
  now: Date;
  bucketIso?: string;
  skipIfExists?: boolean;
}

type RealtimeEstimateFetcher = (fundCode: string, now: Date) => Promise<RealtimeFundEstimate | undefined>;

interface ValuationServiceDeps {
  provider: FundDataProvider;
  repository: Repository;
  cache: Cache;
  realtimeEstimateFetcher?: RealtimeEstimateFetcher;
}

function toPublicSnapshot(snapshot: StoredEstimate | FundEstimateSnapshot, now: Date = nowInShanghai()): FundEstimateSnapshot {
  const isToday = isSameShanghaiDay(snapshot.estimateTime, now);
  return {
    fundCode: snapshot.fundCode,
    fundName: snapshot.fundName,
    officialNav: snapshot.officialNav,
    officialDailyReturn: snapshot.officialDailyReturn,
    estimateNav: snapshot.estimateNav,
    estimateChangePct: snapshot.estimateChangePct,
    baseNavDate: snapshot.baseNavDate,
    estimateTime: snapshot.estimateTime,
    confidenceLevel: isToday ? "HIGH" : "LOW",
    confidenceScore: isToday ? 100 : 0,
    method: snapshot.method,
    inputsStalenessSec: secondsStaleness(snapshot.estimateTime, now),
    holdingReportDate: snapshot.holdingReportDate,
    topHoldings: snapshot.topHoldings,
    disclaimer: snapshot.disclaimer
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex] as T, currentIndex);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export class ValuationService {
  private readonly provider: FundDataProvider;

  private readonly repository: Repository;

  private readonly cache: Cache;

  private readonly realtimeEstimateFetcher: RealtimeEstimateFetcher;

  private readonly pending = new Map<string, Promise<FundEstimateSnapshot>>();

  constructor(deps: ValuationServiceDeps) {
    this.provider = deps.provider;
    this.repository = deps.repository;
    this.cache = deps.cache;
    this.realtimeEstimateFetcher = deps.realtimeEstimateFetcher ?? fetchSinaFundEstimate;
  }

  async bootstrap(): Promise<void> {
    return;
  }

  async listTargetFunds(): Promise<string[]> {
    return this.provider.listTargetFundCodes();
  }

  async getOrComputeEstimate(fundCode: string): Promise<FundEstimateSnapshot> {
    const cached = await this.cache.get<FundEstimateSnapshot>(`estimate:${fundCode}`);
    if (cached) {
      return toPublicSnapshot(cached);
    }

    let pending = this.pending.get(fundCode);
    if (!pending) {
      const now = nowInShanghai();
      pending = this.computeAndPersist(fundCode, {
        now,
        bucketIso: floorToBucketIso(now, getBucketSeconds(now))
      }).finally(() => this.pending.delete(fundCode));
      this.pending.set(fundCode, pending);
    }
    return toPublicSnapshot(await pending);
  }

  async getBatchEstimates(fundCodes: string[]): Promise<BatchEstimateResponse> {
    fundCodes = [...new Set(fundCodes)];
    const cacheKey = `estimate_batch:${fundCodes.slice().sort().join(",")}`;
    const cached = await this.cache.get<BatchEstimateResponse>(cacheKey);
    if (cached) {
      const now = nowInShanghai();
      return { ...cached, data: cached.data.map((snapshot) => toPublicSnapshot(snapshot, now)) };
    }

    const results = await mapWithConcurrency<
      string,
      {
        fundCode: string;
        snapshot?: FundEstimateSnapshot;
      }
    >(fundCodes, BATCH_ESTIMATE_CONCURRENCY, async (fundCode) => {
      try {
        const snapshot = await this.getOrComputeEstimate(fundCode);
        return { fundCode, snapshot };
      } catch {
        return { fundCode };
      }
    });

    const now = nowInShanghai();
    const response: BatchEstimateResponse = {
      data: results
        .filter((item): item is { fundCode: string; snapshot: FundEstimateSnapshot } => Boolean(item.snapshot))
        .map((item) => toPublicSnapshot(item.snapshot, now)),
      partialFailed: results.filter((item) => !item.snapshot).map((item) => item.fundCode)
    };

    await this.cache.set(cacheKey, response, BATCH_CACHE_TTL);
    return response;
  }

  async computeAndPersist(fundCode: string, options: ComputeOptions): Promise<FundEstimateSnapshot> {
    const realtime = await this.realtimeEstimateFetcher(fundCode, options.now);
    if (!realtime) {
      throw new AppError(
        ERROR_CODES.DATA_SOURCE_UNAVAILABLE,
        `Fund estimate temporarily unavailable for ${fundCode}`,
        503
      );
    }

    const isToday = isSameShanghaiDay(realtime.quoteTime, options.now);
    const snapshot: StoredEstimate = {
      fundCode: realtime.fundCode,
      fundName: realtime.fundName,
      officialNav: realtime.officialNav,
      officialDailyReturn: realtime.officialDailyReturn,
      estimateNav: realtime.estimateNav,
      estimateChangePct: realtime.estimateChangePct,
      baseNavDate: realtime.baseNavDate,
      estimateTime: realtime.quoteTime,
      confidenceLevel: isToday ? "HIGH" : "LOW",
      confidenceScore: isToday ? 100 : 0,
      method: "SINA_DIRECT",
      inputsStalenessSec: secondsStaleness(realtime.quoteTime, options.now),
      topHoldings: [],
      disclaimer: DISCLAIMER,
      estimateTimeBucket: options.bucketIso ?? floorToBucketIso(options.now, getBucketSeconds(options.now)),
      inputs: {
        quoteCodes: [fundCode],
        quoteTime: realtime.quoteTime,
        fitScore: 1
      }
    };

    await this.repository.saveEstimate(snapshot);
    const publicSnapshot = toPublicSnapshot(snapshot, options.now);
    await this.cache.set(`estimate:${fundCode}`, publicSnapshot, ESTIMATE_CACHE_TTL);
    return publicSnapshot;
  }
}
