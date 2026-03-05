import { FundProfile, HoldingSnapshot, MarketQuote, NavRecord } from "@digmo/shared";
import { request as httpsRequest } from "node:https";
import { formatDate, getShanghaiYear, nowInShanghai } from "../../utils/time";
import { FundDataProvider, HistoricalReturn } from "./provider";

interface EastmoneyRequestOptions {
  timeoutMs: number;
  userAgent: string;
  referer: string;
}

interface CachedValue<T> {
  expiresAt: number;
  value: T;
}

interface FundArchivesResult {
  reportDate?: string;
  rows: Array<{
    code: string;
    name: string;
    ratio: number;
  }>;
}

interface KlineResponse {
  data?: {
    klines?: string[];
  };
}

interface QuoteResponse {
  data?: {
    diff?: Array<{
      f12?: string;
      f14?: string;
      f3?: number;
    }>;
  };
}

interface FundSearchResponse {
  Datas?: Array<{
    CODE?: string;
    NAME?: string;
    FundBaseInfo?: {
      SHORTNAME?: string;
      FTYPE?: string;
      OTHERNAME?: string;
    };
  }>;
}

interface FundSearchMeta {
  preferredName?: string;
  fundTypeDesc?: string;
}

const PROFILE_TTL_MS = 90 * 1000;
const NAV_TTL_MS = 90 * 1000;
const HOLDING_TTL_MS = 10 * 60 * 1000;
const QUOTES_TTL_MS = 15 * 1000;
const INDEX_HISTORY_TTL_MS = 5 * 60 * 1000;

const FUND_BASE_URL = "https://fund.eastmoney.com";
const FUND_F10_BASE_URL = "https://fundf10.eastmoney.com";
const FUND_SEARCH_BASE_URL = "https://fundsuggest.eastmoney.com";
const QUOTE_BASE_URLS = ["https://push2.eastmoney.com", "https://82.push2.eastmoney.com", "https://push2delay.eastmoney.com"];
const HISTORY_BASE_URLS = [
  "https://push2his.eastmoney.com",
  "https://33.push2his.eastmoney.com",
  "https://90.push2his.eastmoney.com"
];

const BENCHMARK_INDICES: Array<{
  code: string;
  secid: string;
  defaultName: string;
}> = [
  { code: "000300", secid: "1.000300", defaultName: "沪深300" },
  { code: "000905", secid: "1.000905", defaultName: "中证500" },
  { code: "399006", secid: "0.399006", defaultName: "创业板指" },
  { code: "399997", secid: "0.399997", defaultName: "中证白酒" },
  { code: "000819", secid: "1.000819", defaultName: "中证有色金属" },
  { code: "000811", secid: "1.000811", defaultName: "细分有色" },
  { code: "399395", secid: "0.399395", defaultName: "国证有色" }
];

const SECID_BY_INDEX = new Map(BENCHMARK_INDICES.map((item) => [item.code, item.secid]));

function stripTags(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function asNumber(value: unknown): number | undefined {
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

function pctTextToRatio(text: string): number | undefined {
  const match = text.match(/(-?\d+(?:\.\d+)?)%/);
  if (!match) {
    return undefined;
  }
  return Number((Number(match[1]) / 100).toFixed(6));
}

function classifyFundType(fundName: string): string {
  if (fundName.includes("QDII")) {
    return "QDII";
  }
  if (fundName.includes("指数") || fundName.includes("ETF")) {
    return "指数型";
  }
  if (fundName.includes("债")) {
    return "债券型";
  }
  return "混合型";
}

function classifyFundTypeFromEastmoneyType(raw?: string, fallbackName?: string): string {
  const value = raw?.trim() ?? "";
  if (value.includes("QDII")) {
    return "QDII";
  }
  if (value.includes("指数")) {
    return "指数型";
  }
  if (value.includes("债")) {
    return "债券型";
  }
  if (fallbackName) {
    return classifyFundType(fallbackName);
  }
  return "混合型";
}

function pickPreferredFundName(shortName: string, otherNameText?: string): string {
  const aliases = (otherNameText ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!shortName.includes("中国互联网")) {
    const aliasWithChinaInternet = aliases.find((item) => item.includes("中国互联网") && item.includes("联接"));
    if (aliasWithChinaInternet) {
      return aliasWithChinaInternet;
    }
  }

  return shortName;
}

function guessIndexCode(fundName: string): string | undefined {
  if (fundName.includes("细分有色")) {
    return "000811";
  }
  if (fundName.includes("国证有色")) {
    return "399395";
  }
  if (fundName.includes("有色金属") || fundName.includes("有色")) {
    return "000819";
  }
  if (fundName.includes("白酒")) {
    return "399997";
  }
  if (fundName.includes("沪深300")) {
    return "000300";
  }
  if (fundName.includes("中证500")) {
    return "000905";
  }
  if (fundName.includes("创业板")) {
    return "399006";
  }
  return undefined;
}

function toIsoDateFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function parseJsVarLiteral(script: string, variableName: string): string | undefined {
  const regex = new RegExp(`var\\s+${variableName}\\s*=\\s*([\\s\\S]*?);`);
  const match = script.match(regex);
  return match?.[1]?.trim();
}

function parseQuotedStringLiteral(literal?: string): string | undefined {
  if (!literal) {
    return undefined;
  }
  try {
    const value = JSON.parse(literal) as unknown;
    return typeof value === "string" ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

function readLatestAssetRatios(script: string): {
  reportDate?: string;
  stockRatio: number;
  bondRatio: number;
  cashRatio: number;
} {
  const literal = parseJsVarLiteral(script, "Data_assetAllocation");
  if (!literal) {
    return {
      stockRatio: 0,
      bondRatio: 0,
      cashRatio: 0
    };
  }

  try {
    const parsed = JSON.parse(literal) as {
      categories?: string[];
      series?: Array<{
        name?: string;
        data?: Array<number | null>;
      }>;
    };

    const categories = parsed.categories ?? [];
    const latestCategory = categories.at(-1);
    const readRatio = (name: string): number => {
      const series = parsed.series?.find((item) => item.name === name);
      if (!series || !series.data || series.data.length === 0) {
        return 0;
      }
      const value = asNumber(series.data.at(-1));
      if (typeof value !== "number") {
        return 0;
      }
      return Number((value / 100).toFixed(6));
    };

    return {
      reportDate: latestCategory,
      stockRatio: readRatio("股票占净比"),
      bondRatio: readRatio("债券占净比"),
      cashRatio: readRatio("现金占净比")
    };
  } catch {
    return {
      stockRatio: 0,
      bondRatio: 0,
      cashRatio: 0
    };
  }
}

function parseFundArchivesPayload(raw: string): FundArchivesResult | undefined {
  const contentMatch = raw.match(/content:"([\s\S]*?)",arryear:/);
  if (!contentMatch?.[1]) {
    return undefined;
  }

  let html = "";
  try {
    html = JSON.parse(`"${contentMatch[1]}"`) as string;
  } catch {
    return undefined;
  }

  if (!html.trim()) {
    return undefined;
  }

  const reportDate = html.match(/截止至：<font[^>]*>(\d{4}-\d{2}-\d{2})<\/font>/)?.[1];
  const rows: Array<{
    code: string;
    name: string;
    ratio: number;
  }> = [];

  for (const rowMatch of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const rowHtml = rowMatch[1];
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => stripTags(cell[1]));
    if (cells.length < 3) {
      continue;
    }

    const percentCells = cells.map((cell) => pctTextToRatio(cell)).filter((cell): cell is number => typeof cell === "number");
    const ratio = percentCells.at(-1);
    if (typeof ratio !== "number") {
      continue;
    }

    const maybeCode = cells.find((cell) => /\d{5,6}/.test(cell)) ?? "";
    const code = maybeCode.match(/\d{5,6}/)?.[0];
    const nameCell = cells[2] ?? "";
    if (!code || !nameCell) {
      continue;
    }

    rows.push({
      code,
      name: nameCell,
      ratio
    });
  }

  return {
    reportDate,
    rows
  };
}

function buildHoldingsFromArchives(
  stock: FundArchivesResult | undefined,
  bond: FundArchivesResult | undefined
): {
  reportDate?: string;
  rows: Array<{
    code: string;
    name: string;
    ratio: number;
  }>;
} {
  const merged = [...(stock?.rows ?? []), ...(bond?.rows ?? [])];
  const deduped = new Map<string, { code: string; name: string; ratio: number }>();
  for (const row of merged) {
    deduped.set(`${row.code}:${row.name}`, row);
  }

  const rows = [...deduped.values()].sort((a, b) => b.ratio - a.ratio).slice(0, 10);
  const reportDate = stock?.reportDate ?? bond?.reportDate;
  return { reportDate, rows };
}

function parseNavRecords(script: string, fundCode: string): NavRecord[] {
  const literal = parseJsVarLiteral(script, "Data_netWorthTrend");
  if (!literal) {
    return [];
  }

  try {
    const data = JSON.parse(literal) as Array<{
      x?: number;
      y?: number;
      equityReturn?: number;
    }>;
    const rows = data
      .filter((item) => typeof item.x === "number" && typeof item.y === "number")
      .map((item, index, all) => {
        const nav = asNumber(item.y) ?? 0;
        const date = toIsoDateFromMs(item.x as number);
        const equityReturn = asNumber(item.equityReturn);
        let dailyReturn = equityReturn !== undefined ? equityReturn / 100 : 0;

        if (equityReturn === undefined && index > 0) {
          const prev = asNumber(all[index - 1]?.y);
          if (typeof prev === "number" && prev !== 0) {
            dailyReturn = nav / prev - 1;
          }
        }

        return {
          fundCode,
          navDate: date,
          nav: Number(nav.toFixed(4)),
          dailyReturn: Number(dailyReturn.toFixed(6))
        };
      })
      .sort((a, b) => a.navDate.localeCompare(b.navDate));

    return rows;
  } catch {
    return [];
  }
}

function parseIndexHistory(data: KlineResponse, indexCode: string, limit: number): HistoricalReturn[] {
  const klines = data.data?.klines ?? [];
  if (klines.length === 0) {
    return [];
  }

  const rows: Array<{
    date: string;
    close: number;
  }> = [];

  for (const line of klines) {
    const parts = line.split(",");
    if (parts.length < 3) {
      continue;
    }
    const date = parts[0];
    const close = Number(parts[2]);
    if (!date || !Number.isFinite(close) || close <= 0) {
      continue;
    }
    rows.push({ date, close });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  const returns: HistoricalReturn[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const curr = rows[i];
    if (prev.close <= 0) {
      continue;
    }
    const changePct = Number(((curr.close / prev.close) - 1).toFixed(6));
    returns.push({
      date: curr.date,
      changePct
    });
  }

  return returns.slice(Math.max(0, returns.length - limit));
}

function fetchText(url: string, options: EastmoneyRequestOptions): Promise<string | undefined> {
  return new Promise((resolve) => {
    const request = httpsRequest(
      url,
      {
        method: "GET",
        headers: {
          Accept: "*/*",
          "User-Agent": options.userAgent,
          Referer: options.referer
        }
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          resolve(undefined);
          return;
        }

        let payload = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          payload += chunk;
        });
        response.on("end", () => {
          resolve(payload);
        });
      }
    );

    request.setTimeout(options.timeoutMs, () => {
      request.destroy();
      resolve(undefined);
    });
    request.on("error", () => resolve(undefined));
    request.end();
  });
}

async function fetchJson<T>(url: string, options: EastmoneyRequestOptions): Promise<T | undefined> {
  const text = await fetchText(url, options);
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export class EastmoneyFundDataProvider implements FundDataProvider {
  private readonly targetFunds: string[];

  private readonly requestOptions: EastmoneyRequestOptions;

  private readonly profileCache = new Map<string, CachedValue<FundProfile | undefined>>();

  private readonly navCache = new Map<string, CachedValue<NavRecord[]>>();

  private readonly holdingCache = new Map<string, CachedValue<HoldingSnapshot | undefined>>();

  private readonly quoteCache = new Map<string, CachedValue<MarketQuote[]>>();

  private readonly indexHistoryCache = new Map<string, CachedValue<HistoricalReturn[]>>();

  constructor(
    targetFunds: string[],
    options: {
      timeoutMs: number;
      userAgent: string;
      referer: string;
    }
  ) {
    this.targetFunds = [...new Set(targetFunds.map((code) => code.trim()).filter(Boolean))];
    this.requestOptions = {
      timeoutMs: options.timeoutMs,
      userAgent: options.userAgent,
      referer: options.referer
    };
  }

  async listTargetFundCodes(): Promise<string[]> {
    return this.targetFunds;
  }

  async getFundProfile(fundCode: string): Promise<FundProfile | undefined> {
    const cached = this.getCached(this.profileCache, fundCode);
    if (cached !== undefined) {
      return cached;
    }

    const [script, searchMeta] = await Promise.all([this.fetchPingScript(fundCode), this.fetchSearchMeta(fundCode)]);
    if (!script) {
      this.setCached(this.profileCache, fundCode, undefined, PROFILE_TTL_MS);
      return undefined;
    }

    const pingName = parseQuotedStringLiteral(parseJsVarLiteral(script, "fS_name"));
    const normalizedCode = parseQuotedStringLiteral(parseJsVarLiteral(script, "fS_code")) ?? fundCode;
    const fundName = searchMeta?.preferredName ?? pingName;

    if (!fundName) {
      this.setCached(this.profileCache, fundCode, undefined, PROFILE_TTL_MS);
      return undefined;
    }

    const profile: FundProfile = {
      fundCode: normalizedCode,
      fundName,
      fundType: classifyFundTypeFromEastmoneyType(searchMeta?.fundTypeDesc, fundName),
      indexCode: guessIndexCode(fundName)
    };

    this.setCached(this.profileCache, fundCode, profile, PROFILE_TTL_MS);
    return profile;
  }

  async getLatestNavRecord(fundCode: string): Promise<NavRecord | undefined> {
    const records = await this.getRecentNavRecords(fundCode, 1);
    return records.at(-1);
  }

  async getRecentNavRecords(fundCode: string, limit: number): Promise<NavRecord[]> {
    const cached = this.getCached(this.navCache, fundCode);
    if (cached && cached.length > 0) {
      return cached.slice(Math.max(0, cached.length - limit));
    }

    const script = await this.fetchPingScript(fundCode);
    if (!script) {
      this.setCached(this.navCache, fundCode, [], NAV_TTL_MS);
      return [];
    }

    const records = parseNavRecords(script, fundCode);
    this.setCached(this.navCache, fundCode, records, NAV_TTL_MS);
    return records.slice(Math.max(0, records.length - limit));
  }

  async getHoldingSnapshot(fundCode: string): Promise<HoldingSnapshot | undefined> {
    const cached = this.getCached(this.holdingCache, fundCode);
    if (cached !== undefined) {
      return cached;
    }

    const script = await this.fetchPingScript(fundCode);
    if (!script) {
      this.setCached(this.holdingCache, fundCode, undefined, HOLDING_TTL_MS);
      return undefined;
    }

    const [stockResult, bondResult] = await Promise.all([
      this.fetchFundArchives(fundCode, "jjcc"),
      this.fetchFundArchives(fundCode, "zqcc")
    ]);

    const merged = buildHoldingsFromArchives(stockResult, bondResult);
    const ratios = readLatestAssetRatios(script);
    const reportDate =
      merged.reportDate ?? ratios.reportDate ?? (await this.getLatestNavRecord(fundCode))?.navDate ?? formatDate(nowInShanghai());

    const snapshot: HoldingSnapshot = {
      fundCode,
      reportDate,
      stockRatio: ratios.stockRatio,
      bondRatio: ratios.bondRatio,
      cashRatio: ratios.cashRatio,
      holdings: merged.rows
    };

    this.setCached(this.holdingCache, fundCode, snapshot, HOLDING_TTL_MS);
    return snapshot;
  }

  async getLatestMarketQuotes(): Promise<MarketQuote[]> {
    const quoteCacheKey = "benchmark";
    const cached = this.getCached(this.quoteCache, quoteCacheKey);
    if (cached && cached.length > 0) {
      return cached;
    }

    const secids = BENCHMARK_INDICES.map((item) => item.secid).join(",");
    const query = new URLSearchParams({
      fltt: "2",
      invt: "2",
      fields: "f12,f14,f3",
      secids
    });

    for (const host of QUOTE_BASE_URLS) {
      const url = `${host}/api/qt/ulist.np/get?${query.toString()}`;
      const payload = await fetchJson<QuoteResponse>(url, this.requestOptions);
      const rows = payload?.data?.diff ?? [];
      if (rows.length === 0) {
        continue;
      }

      const now = nowInShanghai();
      const quoteDate = formatDate(now);
      const quoteTime = now.toISOString();
      const quotes: MarketQuote[] = rows
        .map((item) => {
          const code = item.f12?.trim();
          const changePctPercent = asNumber(item.f3);
          if (!code || typeof changePctPercent !== "number") {
            return undefined;
          }

          return {
            code,
            name: item.f14?.trim() || BENCHMARK_INDICES.find((entry) => entry.code === code)?.defaultName || code,
            quoteDate,
            quoteTime,
            changePct: Number((changePctPercent / 100).toFixed(6)),
            source: "EASTMONEY"
          };
        })
        .filter((item): item is MarketQuote => Boolean(item));

      if (quotes.length > 0) {
        this.setCached(this.quoteCache, quoteCacheKey, quotes, QUOTES_TTL_MS);
        return quotes;
      }
    }

    return [];
  }

  async getHistoricalIndexReturns(indexCode: string, limit: number): Promise<HistoricalReturn[]> {
    if (limit <= 0) {
      return [];
    }

    const cacheKey = `${indexCode}:${limit}`;
    const cached = this.getCached(this.indexHistoryCache, cacheKey);
    if (cached && cached.length > 0) {
      return cached;
    }

    const secid = SECID_BY_INDEX.get(indexCode);
    if (!secid) {
      this.setCached(this.indexHistoryCache, cacheKey, [], INDEX_HISTORY_TTL_MS);
      return [];
    }

    const query = new URLSearchParams({
      secid,
      klt: "101",
      fqt: "1",
      lmt: String(Math.max(limit + 20, 80)),
      end: "20500000",
      fields1: "f1,f2,f3",
      fields2: "f51,f52,f53,f57,f58"
    });

    for (const host of HISTORY_BASE_URLS) {
      const url = `${host}/api/qt/stock/kline/get?${query.toString()}`;
      const payload = await fetchJson<KlineResponse>(url, this.requestOptions);
      const parsed = payload ? parseIndexHistory(payload, indexCode, limit) : [];
      if (parsed.length > 0) {
        this.setCached(this.indexHistoryCache, cacheKey, parsed, INDEX_HISTORY_TTL_MS);
        return parsed;
      }
    }

    this.setCached(this.indexHistoryCache, cacheKey, [], INDEX_HISTORY_TTL_MS);
    return [];
  }

  private async fetchPingScript(fundCode: string): Promise<string | undefined> {
    const url = `${FUND_BASE_URL}/pingzhongdata/${fundCode}.js?v=${Date.now()}`;
    return fetchText(url, this.requestOptions);
  }

  private async fetchFundArchives(fundCode: string, type: "jjcc" | "zqcc"): Promise<FundArchivesResult | undefined> {
    const year = getShanghaiYear(nowInShanghai());
    const firstUrl = `${FUND_F10_BASE_URL}/FundArchivesDatas.aspx?type=${type}&code=${fundCode}&topline=10`;
    const fallbackUrl = `${FUND_F10_BASE_URL}/FundArchivesDatas.aspx?type=${type}&code=${fundCode}&topline=10&year=${year}&month=12`;

    const first = await fetchText(firstUrl, this.requestOptions);
    const parsedFirst = first ? parseFundArchivesPayload(first) : undefined;
    if (parsedFirst?.rows.length) {
      return parsedFirst;
    }

    const second = await fetchText(fallbackUrl, this.requestOptions);
    const parsedSecond = second ? parseFundArchivesPayload(second) : undefined;
    if (parsedSecond?.rows.length) {
      return parsedSecond;
    }

    return parsedFirst ?? parsedSecond;
  }

  private async fetchSearchMeta(fundCode: string): Promise<FundSearchMeta | undefined> {
    const query = new URLSearchParams({
      m: "1",
      key: fundCode
    });
    const url = `${FUND_SEARCH_BASE_URL}/FundSearch/api/FundSearchAPI.ashx?${query.toString()}`;
    const payload = await fetchJson<FundSearchResponse>(url, this.requestOptions);
    const rows = payload?.Datas ?? [];
    const target = rows.find((item) => item.CODE === fundCode) ?? rows[0];
    const shortName = target?.FundBaseInfo?.SHORTNAME ?? target?.NAME;
    if (!shortName) {
      return undefined;
    }

    return {
      preferredName: pickPreferredFundName(shortName, target?.FundBaseInfo?.OTHERNAME),
      fundTypeDesc: target?.FundBaseInfo?.FTYPE
    };
  }

  private getCached<T>(cache: Map<string, CachedValue<T>>, key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private setCached<T>(cache: Map<string, CachedValue<T>>, key: string, value: T, ttlMs: number): void {
    cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }
}
