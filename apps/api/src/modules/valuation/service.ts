import {
  BatchEstimateResponse,
  DISCLAIMER,
  ERROR_CODES,
  FundEstimateSnapshot,
  ValuationMethod
} from "@digmo/shared";
import { Cache } from "../../infra/cache/cache.js";
import { Repository, StoredEstimate } from "../../infra/repo/repository.js";
import {
  floorToBucketIso,
  formatDate,
  getBucketSeconds,
  isTradingDay,
  isTradingTime,
  nowInShanghai,
  secondsStaleness
} from "../../utils/time.js";
import { AppError } from "../../utils/app-error.js";
import { EastmoneyQuote, EastmoneyQuoteClient } from "../data/eastmoney-client.js";
import { FundDataProvider } from "../data/provider.js";
import { evaluateConfidence } from "./confidence.js";

const ESTIMATE_CACHE_TTL = 45;
const BATCH_CACHE_TTL = 20;
const QUOTE_CACHE_TTL = 30;
const FUND_GZ_TIMEOUT_MS = 2_000;
const BATCH_ESTIMATE_CONCURRENCY = 6;

interface ComputeOptions {
  now: Date;
  bucketIso?: string;
  skipIfExists?: boolean;
}

interface RealtimeFundEstimate {
  fundCode: string;
  name?: string;
  officialNav?: number;
  estimateNav?: number;
  changePct: number;
  quoteTime: string;
}

type RealtimeEstimateFetcher = (fundCode: string, now: Date) => Promise<RealtimeFundEstimate | undefined>;

interface ValuationServiceDeps {
  provider: FundDataProvider;
  repository: Repository;
  cache: Cache;
  eastmoneyClient?: EastmoneyQuoteClient;
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
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function formatBootstrapError(error: unknown): string {
  if (error instanceof AppError) {
    return `${error.code}:${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown_error";
}

function parseFundGzTimeToIso(raw: string | undefined, fallback: Date): string {
  if (!raw) {
    return fallback.toISOString();
  }

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return fallback.toISOString();
  }

  const year = match[1];
  const month = match[2];
  const day = match[3];
  const hour = match[4];
  const minute = match[5];
  const second = match[6] ?? "00";

  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
}

function isSameShanghaiDate(isoTime: string | undefined, shanghaiDate: string): boolean {
  if (!isoTime) {
    return false;
  }

  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return formatDate(date) === shanghaiDate;
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

  private readonly eastmoneyClient?: EastmoneyQuoteClient;

  private readonly realtimeEstimateFetcher: RealtimeEstimateFetcher;

  constructor(deps: ValuationServiceDeps) {
    this.provider = deps.provider;
    this.repository = deps.repository;
    this.cache = deps.cache;
    this.eastmoneyClient = deps.eastmoneyClient;
    this.realtimeEstimateFetcher = deps.realtimeEstimateFetcher ?? this.fetchRealtimeEstimateFromFundGz.bind(this);
  }

  async bootstrap(): Promise<void> {
    const fundCodes = await this.provider.listTargetFundCodes();
    const failedFunds: Array<{ fundCode: string; reason: string }> = [];

    await Promise.all(
      fundCodes.map(async (fundCode) => {
        try {
          await this.ensureFundData(fundCode);
        } catch (error) {
          failedFunds.push({
            fundCode,
            reason: formatBootstrapError(error)
          });
        }
      })
    );

    if (failedFunds.length > 0) {
      console.warn("[valuation] bootstrap skipped unavailable funds", {
        failedCount: failedFunds.length,
        totalCount: fundCodes.length,
        failedFunds
      });
    }
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
    const bucketIso = floorToBucketIso(now, getBucketSeconds(now));
    const tradingTimeNow = isTradingTime(now);

    try {
      const fresh = await this.computeAndPersist(fundCode, {
        now,
        bucketIso,
        // 仅在交易时段内做 bucket 幂等，非交易时段允许按缓存窗口重算，
        // 以便收盘后官方净值一旦发布能快速反映到接口结果。
        skipIfExists: tradingTimeNow
      });
      return toPublicSnapshot(fresh);
    } catch (error) {
      const previous = await this.repository.getLatestEstimate(fundCode);
      if (!previous) {
        throw error;
      }

      const degraded: FundEstimateSnapshot = {
        ...previous,
        confidenceScore: Math.min(previous.confidenceScore, 40),
        confidenceLevel: "LOW",
        inputsStalenessSec: secondsStaleness(previous.estimateTime, now),
        disclaimer: DISCLAIMER
      };

      await this.cache.set(`estimate:${fundCode}`, degraded, ESTIMATE_CACHE_TTL);
      return toPublicSnapshot(degraded);
    }
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
        return {
          fundCode,
          snapshot
        };
      } catch {
        return {
          fundCode
        };
      }
    });

    const data = results
      .filter((item): item is { fundCode: string; snapshot: FundEstimateSnapshot } => Boolean(item.snapshot))
      .map((item) => item.snapshot);
    const partialFailed = results.filter((item) => !item.snapshot).map((item) => item.fundCode);

    const response: BatchEstimateResponse = {
      data,
      partialFailed
    };

    await this.cache.set(cacheKey, response, BATCH_CACHE_TTL);
    return response;
  }

  async computeAndPersist(fundCode: string, options: ComputeOptions): Promise<FundEstimateSnapshot> {
    if (options.skipIfExists && options.bucketIso) {
      const hasBucket = await this.repository.hasEstimateInBucket(fundCode, options.bucketIso);
      if (hasBucket) {
        const existing = await this.repository.getLatestEstimate(fundCode);
        if (existing) {
          const publicSnapshot = toPublicSnapshot(existing);
          await this.cache.set(`estimate:${fundCode}`, publicSnapshot, ESTIMATE_CACHE_TTL);
          return publicSnapshot;
        }
      }
    }

    await this.ensureFundData(fundCode);

    const [profile, latestNav, holding] = await Promise.all([
      this.repository.getFundProfile(fundCode),
      this.repository.getLatestNavRecord(fundCode),
      this.repository.getLatestHoldingSnapshot(fundCode)
    ]);

    if (!profile) {
      throw new AppError(ERROR_CODES.FUND_NOT_FOUND, `Fund ${fundCode} not found`, 404);
    }

    if (!latestNav) {
      throw new AppError(ERROR_CODES.ESTIMATE_NOT_READY, `No NAV for fund ${fundCode}`, 503);
    }

    const today = formatDate(options.now);
    const tradingDay = isTradingDay(options.now);

    let method: ValuationMethod = "INDEX_TRACKING";
    const fitScore = 1;
    const recentError = 0;
    let quoteTime = options.now.toISOString();
    let stalenessSec = 0;
    const quoteCodes: string[] = [fundCode];

    let estimateNav = latestNav.nav;
    let estimateChangePct = 0;
    let fundName = profile.fundName;
    let officialNav = latestNav.nav;

    if (!tradingDay) {
      // 非交易日盘中估算涨跌固定为 0。
      estimateNav = latestNav.nav;
      estimateChangePct = 0;
    } else {
      const realtime = await this.realtimeEstimateFetcher(fundCode, options.now);
      const realtimeIsToday = Boolean(realtime && isSameShanghaiDate(realtime.quoteTime, today));
      if (realtime && realtimeIsToday) {
        method = "FUND_GZ_DIRECT";
        estimateChangePct = realtime.changePct;
        fundName = realtime.name ?? profile.fundName;
        officialNav = realtime.officialNav ?? latestNav.nav;
        estimateNav =
          realtime.estimateNav ?? Number((officialNav * (1 + estimateChangePct)).toFixed(6));
        quoteTime = realtime.quoteTime;
        stalenessSec = secondsStaleness(realtime.quoteTime, options.now);
      } else {
        estimateNav = latestNav.nav;
        estimateChangePct = 0;
      }
    }

    const confidence = evaluateConfidence({
      method,
      quoteStalenessSec: stalenessSec,
      holdingAgeDays: 0,
      fitScore,
      recentError
    });

    const snapshot: StoredEstimate = {
      fundCode,
      fundName,
      officialNav,
      officialDailyReturn: latestNav.dailyReturn,
      estimateNav,
      estimateChangePct,
      baseNavDate: latestNav.navDate,
      estimateTime: options.now.toISOString(),
      confidenceLevel: confidence.level,
      confidenceScore: confidence.score,
      method,
      inputsStalenessSec: stalenessSec,
      holdingReportDate: holding?.reportDate,
      topHoldings: await this.enrichTopHoldings(holding?.holdings.slice(0, 5) ?? []),
      disclaimer: DISCLAIMER,
      estimateTimeBucket: options.bucketIso ?? floorToBucketIso(options.now, getBucketSeconds(options.now)),
      inputs: {
        quoteCodes,
        quoteTime,
        fitScore,
        holdingReportDate: holding?.reportDate,
        recentError
      }
    };

    await this.repository.saveEstimate(snapshot);
    const publicSnapshot = toPublicSnapshot(snapshot);
    await this.cache.set(`estimate:${fundCode}`, publicSnapshot, ESTIMATE_CACHE_TTL);

    return publicSnapshot;
  }

  private async ensureFundData(fundCode: string): Promise<void> {
    const [profile, latestNav, navHistory, holding] = await Promise.all([
      this.provider.getFundProfile(fundCode),
      this.provider.getLatestNavRecord(fundCode),
      this.provider.getRecentNavRecords(fundCode, 180),
      this.provider.getHoldingSnapshot(fundCode)
    ]);

    if (!profile) {
      throw new AppError(ERROR_CODES.FUND_NOT_FOUND, `Fund ${fundCode} not found`, 404);
    }

    await this.repository.saveFundProfile(profile);

    if (latestNav) {
      await this.repository.saveNavRecord(latestNav);
    }

    if (navHistory.length > 0) {
      await this.repository.saveNavRecords(navHistory);
    }

    if (holding) {
      await this.repository.saveHoldingSnapshot(holding);
    }
  }

  private async enrichTopHoldings(
    holdings: Array<{
      code: string;
      name: string;
      ratio: number;
    }>
  ): Promise<
    Array<{
      code: string;
      name: string;
      ratio: number;
      latestPrice?: number;
      changePct?: number;
      marketCap?: number;
      floatMarketCap?: number;
      source?: string;
    }>
  > {
    if (!this.eastmoneyClient?.isEnabled() || holdings.length === 0) {
      return holdings;
    }

    const rows = await Promise.all(
      holdings.map(async (holding) => {
        const quote = await this.getStockQuoteWithCache(holding.code);
        if (!quote) {
          return holding;
        }

        return {
          ...holding,
          latestPrice: quote.current,
          changePct: typeof quote.percent === "number" ? quote.percent / 100 : undefined,
          marketCap: quote.marketCapital,
          floatMarketCap: quote.floatMarketCapital,
          source: "SCRIPT_MIXED"
        };
      })
    );

    return rows;
  }

  private async getStockQuoteWithCache(stockCode: string): Promise<EastmoneyQuote | undefined> {
    const key = `quote:stock:${stockCode}`;
    const cached = await this.cache.get<EastmoneyQuote>(key);
    if (cached) {
      return cached;
    }

    const quote = await this.eastmoneyClient?.fetchQuoteByCode(stockCode);
    if (!quote) {
      return undefined;
    }

    await this.cache.set(key, quote, QUOTE_CACHE_TTL);
    return quote;
  }

  private async fetchRealtimeEstimateFromFundGz(fundCode: string, now: Date): Promise<RealtimeFundEstimate | undefined> {
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
        dwjz?: string;
        gsz?: string;
        gszzl?: string;
        gztime?: string;
      };

      if (!payload.fundcode) {
        return undefined;
      }

      const officialNav = toFiniteNumber(payload.dwjz);
      const estimateNav = toFiniteNumber(payload.gsz);
      const changePctPercent = toFiniteNumber(payload.gszzl);
      if (typeof changePctPercent !== "number") {
        return undefined;
      }
      const changePct = Number((changePctPercent / 100).toFixed(6));

      return {
        fundCode: code,
        name: payload.name,
        officialNav,
        estimateNav,
        changePct,
        quoteTime: parseFundGzTimeToIso(payload.gztime, now)
      };
    } catch {
      return undefined;
    }
  }
}
