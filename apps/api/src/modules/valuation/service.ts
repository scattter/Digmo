import { BatchEstimateResponse, DISCLAIMER, ERROR_CODES, FundEstimateSnapshot } from "@digmo/shared";
import { Cache } from "../../infra/cache/cache.js";
import { Repository, StoredEstimate } from "../../infra/repo/repository.js";
import { floorToBucketIso, getBucketSeconds, nowInShanghai, secondsStaleness } from "../../utils/time.js";
import { AppError } from "../../utils/app-error.js";
import { FundDataProvider } from "../data/provider.js";

const ESTIMATE_CACHE_TTL = 45;
const BATCH_CACHE_TTL = 20;
const FUND_GZ_TIMEOUT_MS = 2_000;
const BATCH_ESTIMATE_CONCURRENCY = 6;

interface ComputeOptions {
  now: Date;
  bucketIso?: string;
  skipIfExists?: boolean;
}

interface FundGzEstimate {
  fundCode: string;
  fundName: string;
  officialNav: number;
  estimateNav: number;
  estimateChangePct: number;
  baseNavDate: string;
  quoteTime: string;
}

type RealtimeEstimateFetcher = (fundCode: string, now: Date) => Promise<FundGzEstimate | undefined>;

interface ValuationServiceDeps {
  provider: FundDataProvider;
  repository: Repository;
  cache: Cache;
  realtimeEstimateFetcher?: RealtimeEstimateFetcher;
}

function toPublicSnapshot(snapshot: StoredEstimate | FundEstimateSnapshot): FundEstimateSnapshot {
  return {
    fundCode: snapshot.fundCode,
    fundName: snapshot.fundName,
    officialNav: snapshot.officialNav,
    officialDailyReturn: snapshot.officialDailyReturn,
    estimateNav: snapshot.estimateNav,
    estimateChangePct: snapshot.estimateChangePct,
    baseNavDate: snapshot.baseNavDate,
    estimateTime: snapshot.estimateTime,
    confidenceLevel: snapshot.confidenceLevel,
    confidenceScore: snapshot.confidenceScore,
    method: snapshot.method,
    inputsStalenessSec: snapshot.inputsStalenessSec,
    holdingReportDate: snapshot.holdingReportDate,
    topHoldings: snapshot.topHoldings,
    disclaimer: snapshot.disclaimer
  };
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

function parseFundGzTimeToIso(raw: string | undefined, fallback: Date): string {
  if (!raw) {
    return fallback.toISOString();
  }

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return fallback.toISOString();
  }

  const [, year, month, day, hour, minute, second = "00"] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
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

  constructor(deps: ValuationServiceDeps) {
    this.provider = deps.provider;
    this.repository = deps.repository;
    this.cache = deps.cache;
    this.realtimeEstimateFetcher = deps.realtimeEstimateFetcher ?? this.fetchRealtimeEstimateFromFundGz.bind(this);
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

    const now = nowInShanghai();
    return this.computeAndPersist(fundCode, {
      now,
      bucketIso: floorToBucketIso(now, getBucketSeconds(now))
    });
  }

  async getBatchEstimates(fundCodes: string[]): Promise<BatchEstimateResponse> {
    const cacheKey = `estimate_batch:${fundCodes.slice().sort().join(",")}`;
    const cached = await this.cache.get<BatchEstimateResponse>(cacheKey);
    if (cached) {
      return cached;
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

    const response: BatchEstimateResponse = {
      data: results
        .filter((item): item is { fundCode: string; snapshot: FundEstimateSnapshot } => Boolean(item.snapshot))
        .map((item) => item.snapshot),
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

    const snapshot: StoredEstimate = {
      fundCode: realtime.fundCode,
      fundName: realtime.fundName,
      officialNav: realtime.officialNav,
      estimateNav: realtime.estimateNav,
      estimateChangePct: realtime.estimateChangePct,
      baseNavDate: realtime.baseNavDate,
      estimateTime: realtime.quoteTime,
      confidenceLevel: "HIGH",
      confidenceScore: 100,
      method: "FUND_GZ_DIRECT",
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
    const publicSnapshot = toPublicSnapshot(snapshot);
    await this.cache.set(`estimate:${fundCode}`, publicSnapshot, ESTIMATE_CACHE_TTL);
    return publicSnapshot;
  }

  private async fetchRealtimeEstimateFromFundGz(fundCode: string, now: Date): Promise<FundGzEstimate | undefined> {
    const code = fundCode.trim();
    if (!/^\d{6}$/.test(code)) {
      return undefined;
    }

    const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FUND_GZ_TIMEOUT_MS);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "*/*",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "http://fund.eastmoney.com/"
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return undefined;
      }

      const text = await response.text();
      const match = text.match(/jsonpgz\((\{.*?\})\)/);
      if (!match?.[1]) {
        return undefined;
      }

      const payload = JSON.parse(match[1]) as {
        fundcode?: string;
        name?: string;
        jzrq?: string;
        dwjz?: string;
        gsz?: string;
        gszzl?: string;
        gztime?: string;
      };

      const officialNav = toFiniteNumber(payload.dwjz);
      const estimateNav = toFiniteNumber(payload.gsz);
      const changePctPercent = toFiniteNumber(payload.gszzl);
      const baseNavDate = typeof payload.jzrq === "string" ? payload.jzrq.trim() : "";
      const quoteTime = parseFundGzTimeToIso(payload.gztime, now);

      if (
        payload.fundcode !== code ||
        typeof payload.name !== "string" ||
        !baseNavDate ||
        typeof officialNav !== "number" ||
        typeof estimateNav !== "number" ||
        typeof changePctPercent !== "number"
      ) {
        return undefined;
      }

      return {
        fundCode: code,
        fundName: payload.name.trim(),
        officialNav,
        estimateNav,
        estimateChangePct: Number((changePctPercent / 100).toFixed(6)),
        baseNavDate,
        quoteTime
      };
    } catch {
      return undefined;
    }
  }
}
