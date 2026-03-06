import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type MarketKind = "fund" | "stock";

type FundProviderName = "fundgz_direct" | "digmo_api";
type StockProviderName = "alpaca" | "twelvedata" | "alphavantage";
type ProviderName = FundProviderName | StockProviderName;

interface Sample {
  provider: ProviderName;
  market: MarketKind;
  symbol: string;
  round: number;
  ok: boolean;
  latencyMs: number;
  value?: number;
  error?: string;
  timestamp: string;
}

interface DemoConfig {
  rounds: number;
  intervalMs: number;
  timeoutMs: number;
  fundCodes: string[];
  stockSymbols: string[];
  appApiBaseUrl: string;
}

interface ProviderSummary {
  provider: ProviderName;
  market: MarketKind;
  enabled: boolean;
  successRate: number;
  successCount: number;
  totalCount: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  notes: string[];
}

function parseList(input: string | undefined): string[] {
  if (!input) {
    return [];
  }
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function fetchTextWithTimeout(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>
): Promise<T> {
  const text = await fetchTextWithTimeout(url, timeoutMs, headers);
  return JSON.parse(text) as T;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank] ?? null;
}

function avg(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function formatMs(value: number | null): string {
  if (typeof value !== "number") {
    return "n/a";
  }
  return `${value.toFixed(1)}ms`;
}

function formatBps(value: number | null): string {
  if (typeof value !== "number") {
    return "n/a";
  }
  return `${value.toFixed(2)}bps`;
}

async function probeFundGz(fundCode: string, timeoutMs: number): Promise<number> {
  const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${Date.now()}`;
  const text = await fetchTextWithTimeout(url, timeoutMs, {
    Accept: "*/*",
    "User-Agent": "Mozilla/5.0",
    Referer: "http://fund.eastmoney.com/"
  });
  const match = text.match(/jsonpgz\((\{.*?\})\)/);
  if (!match?.[1]) {
    throw new Error("fundgz payload parse failed");
  }
  const payload = JSON.parse(match[1]) as { gszzl?: string | number };
  const changePctPercent = toFiniteNumber(payload.gszzl);
  if (typeof changePctPercent !== "number") {
    throw new Error("fundgz missing gszzl");
  }
  return changePctPercent / 100;
}

async function probeDigmoFundEstimate(fundCode: string, timeoutMs: number, baseUrl: string): Promise<number> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/v1/funds/${fundCode}/estimate`;
  const payload = await fetchJsonWithTimeout<{ estimateChangePct?: number }>(endpoint, timeoutMs);
  if (typeof payload.estimateChangePct !== "number") {
    throw new Error("digmo estimateChangePct missing");
  }
  return payload.estimateChangePct;
}

async function probeAlpaca(symbol: string, timeoutMs: number): Promise<number> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) {
    throw new Error("ALPACA_API_KEY or ALPACA_API_SECRET is missing");
  }

  const endpoint = `https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=${encodeURIComponent(symbol)}`;
  const payload = await fetchJsonWithTimeout<{
    quotes?: Record<string, { ap?: number; bp?: number }>;
    message?: string;
  }>(endpoint, timeoutMs, {
    accept: "application/json",
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret
  });

  const row = payload.quotes?.[symbol];
  if (!row) {
    throw new Error(payload.message ?? "alpaca quote missing");
  }

  if (typeof row.ap === "number" && typeof row.bp === "number") {
    return (row.ap + row.bp) / 2;
  }

  if (typeof row.ap === "number") {
    return row.ap;
  }

  if (typeof row.bp === "number") {
    return row.bp;
  }

  throw new Error("alpaca quote price missing");
}

async function probeTwelveData(symbol: string, timeoutMs: number): Promise<number> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) {
    throw new Error("TWELVEDATA_API_KEY is missing");
  }
  const endpoint = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
  const payload = await fetchJsonWithTimeout<{ price?: string | number; message?: string; status?: string }>(
    endpoint,
    timeoutMs
  );
  const price = toFiniteNumber(payload.price);
  if (typeof price !== "number") {
    throw new Error(payload.message ?? "twelvedata price missing");
  }
  return price;
}

async function probeAlphaVantage(symbol: string, timeoutMs: number): Promise<number> {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) {
    throw new Error("ALPHAVANTAGE_API_KEY is missing");
  }
  const endpoint =
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}` +
    `&apikey=${encodeURIComponent(key)}`;

  const payload = await fetchJsonWithTimeout<
    Record<string, unknown> & {
      "Global Quote"?: Record<string, unknown>;
      Note?: string;
      Information?: string;
    }
  >(endpoint, timeoutMs);

  if (payload.Note || payload.Information) {
    throw new Error(String(payload.Note ?? payload.Information));
  }

  const row = payload["Global Quote"];
  const price = toFiniteNumber(row?.["05. price"]);
  if (typeof price !== "number") {
    throw new Error("alphavantage price missing");
  }
  return price;
}

function providerEnabled(provider: ProviderName): boolean {
  if (provider === "digmo_api") {
    return true;
  }
  if (provider === "fundgz_direct") {
    return true;
  }
  if (provider === "alpaca") {
    return Boolean(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET);
  }
  if (provider === "twelvedata") {
    return Boolean(process.env.TWELVEDATA_API_KEY);
  }
  if (provider === "alphavantage") {
    return Boolean(process.env.ALPHAVANTAGE_API_KEY);
  }
  return false;
}

async function run(): Promise<void> {
  const config: DemoConfig = {
    rounds: Math.max(1, Number(process.env.DEMO_ROUNDS ?? 6)),
    intervalMs: Math.max(0, Number(process.env.DEMO_INTERVAL_MS ?? 1500)),
    timeoutMs: Math.max(500, Number(process.env.DEMO_TIMEOUT_MS ?? 4500)),
    fundCodes: parseList(process.env.DEMO_FUND_CODES ?? "020273"),
    stockSymbols: parseList(process.env.DEMO_STOCK_SYMBOLS ?? "AAPL,MSFT"),
    appApiBaseUrl: process.env.DEMO_APP_API_BASE_URL ?? "http://localhost:3001"
  };

  const fundProviders: FundProviderName[] = ["fundgz_direct", "digmo_api"];
  const stockProviders: StockProviderName[] = ["alpaca", "twelvedata", "alphavantage"];
  const samples: Sample[] = [];

  console.log("=== Realtime Provider PoC ===");
  console.log(
    JSON.stringify(
      {
        startedAt: nowIso(),
        config,
        providerEnabled: {
          fundgz_direct: providerEnabled("fundgz_direct"),
          digmo_api: providerEnabled("digmo_api"),
          alpaca: providerEnabled("alpaca"),
          twelvedata: providerEnabled("twelvedata"),
          alphavantage: providerEnabled("alphavantage")
        }
      },
      null,
      2
    )
  );

  for (let round = 1; round <= config.rounds; round += 1) {
    console.log(`\n[round ${round}/${config.rounds}]`);

    const jobs: Array<Promise<void>> = [];

    for (const code of config.fundCodes) {
      for (const provider of fundProviders) {
        jobs.push(
          (async () => {
            const started = Date.now();
            try {
              const value =
                provider === "fundgz_direct"
                  ? await probeFundGz(code, config.timeoutMs)
                  : await probeDigmoFundEstimate(code, config.timeoutMs, config.appApiBaseUrl);

              const latencyMs = Date.now() - started;
              samples.push({
                provider,
                market: "fund",
                symbol: code,
                round,
                ok: true,
                latencyMs,
                value,
                timestamp: nowIso()
              });
              console.log(`fund ${provider} ${code} ok latency=${latencyMs}ms value=${(value * 100).toFixed(4)}%`);
            } catch (error) {
              const latencyMs = Date.now() - started;
              const message = error instanceof Error ? error.message : String(error);
              samples.push({
                provider,
                market: "fund",
                symbol: code,
                round,
                ok: false,
                latencyMs,
                error: message,
                timestamp: nowIso()
              });
              console.log(`fund ${provider} ${code} fail latency=${latencyMs}ms reason=${message}`);
            }
          })()
        );
      }
    }

    for (const symbol of config.stockSymbols) {
      for (const provider of stockProviders) {
        if (!providerEnabled(provider)) {
          continue;
        }
        jobs.push(
          (async () => {
            const started = Date.now();
            try {
              let value: number;
              if (provider === "alpaca") {
                value = await probeAlpaca(symbol, config.timeoutMs);
              } else if (provider === "twelvedata") {
                value = await probeTwelveData(symbol, config.timeoutMs);
              } else {
                value = await probeAlphaVantage(symbol, config.timeoutMs);
              }

              const latencyMs = Date.now() - started;
              samples.push({
                provider,
                market: "stock",
                symbol,
                round,
                ok: true,
                latencyMs,
                value,
                timestamp: nowIso()
              });
              console.log(`stock ${provider} ${symbol} ok latency=${latencyMs}ms value=${value.toFixed(4)}`);
            } catch (error) {
              const latencyMs = Date.now() - started;
              const message = error instanceof Error ? error.message : String(error);
              samples.push({
                provider,
                market: "stock",
                symbol,
                round,
                ok: false,
                latencyMs,
                error: message,
                timestamp: nowIso()
              });
              console.log(`stock ${provider} ${symbol} fail latency=${latencyMs}ms reason=${message}`);
            }
          })()
        );
      }
    }

    await Promise.all(jobs);
    if (round < config.rounds && config.intervalMs > 0) {
      await sleep(config.intervalMs);
    }
  }

  const allProviders: Array<{ provider: ProviderName; market: MarketKind }> = [
    { provider: "fundgz_direct", market: "fund" },
    { provider: "digmo_api", market: "fund" },
    { provider: "alpaca", market: "stock" },
    { provider: "twelvedata", market: "stock" },
    { provider: "alphavantage", market: "stock" }
  ];

  const summaries: ProviderSummary[] = allProviders.map(({ provider, market }) => {
    const enabled = market === "fund" ? true : providerEnabled(provider);
    const group = samples.filter((item) => item.provider === provider && item.market === market);
    const okRows = group.filter((item) => item.ok);
    const latencies = okRows.map((item) => item.latencyMs);
    const notes: string[] = [];

    if (!enabled) {
      notes.push("provider disabled (missing API key)");
    }
    if (enabled && group.length === 0) {
      notes.push("provider enabled but no sample collected");
    }

    return {
      provider,
      market,
      enabled,
      successRate: group.length === 0 ? 0 : okRows.length / group.length,
      successCount: okRows.length,
      totalCount: group.length,
      avgLatencyMs: avg(latencies),
      p95LatencyMs: percentile(latencies, 95),
      notes
    };
  });

  const fundPairDiffBps: number[] = [];
  for (const code of config.fundCodes) {
    for (let round = 1; round <= config.rounds; round += 1) {
      const direct = samples.find(
        (item) => item.market === "fund" && item.provider === "fundgz_direct" && item.symbol === code && item.round === round && item.ok
      );
      const digmo = samples.find(
        (item) => item.market === "fund" && item.provider === "digmo_api" && item.symbol === code && item.round === round && item.ok
      );
      if (typeof direct?.value === "number" && typeof digmo?.value === "number") {
        const diffBps = Math.abs(direct.value - digmo.value) * 10000;
        fundPairDiffBps.push(diffBps);
      }
    }
  }

  const stockDriftByProvider = new Map<StockProviderName, number[]>();
  for (const provider of stockProviders) {
    stockDriftByProvider.set(provider, []);
  }

  for (const symbol of config.stockSymbols) {
    for (let round = 1; round <= config.rounds; round += 1) {
      const rows = samples.filter(
        (item) => item.market === "stock" && item.symbol === symbol && item.round === round && item.ok && typeof item.value === "number"
      );
      const center = median(rows.map((item) => item.value as number));
      if (typeof center !== "number" || center <= 0) {
        continue;
      }

      for (const row of rows) {
        const driftBps = (Math.abs((row.value as number) - center) / center) * 10000;
        stockDriftByProvider.get(row.provider as StockProviderName)?.push(driftBps);
      }
    }
  }

  const stockDriftSummary = Object.fromEntries(
    stockProviders.map((provider) => {
      const values = stockDriftByProvider.get(provider) ?? [];
      return [
        provider,
        {
          meanDriftBps: avg(values),
          maxDriftBps: values.length === 0 ? null : Math.max(...values),
          sampleCount: values.length
        }
      ];
    })
  );

  const decision = {
    generatedAt: nowIso(),
    thresholds: {
      successRateGte: 0.95,
      p95LatencyMsLte: 1200,
      stockMeanDriftBpsLte: 30,
      fundApiVsFundGzMeanDiffBpsLte: 15,
      fundApiVsFundGzMaxDiffBpsLte: 40
    },
    checks: {
      fundApiAccuracy: {
        meanDiffBps: avg(fundPairDiffBps),
        maxDiffBps: fundPairDiffBps.length === 0 ? null : Math.max(...fundPairDiffBps),
        sampleCount: fundPairDiffBps.length,
        pass:
          typeof avg(fundPairDiffBps) === "number" &&
          (avg(fundPairDiffBps) as number) <= 15 &&
          (fundPairDiffBps.length === 0 ? false : Math.max(...fundPairDiffBps) <= 40)
      },
      providerFeasibility: summaries.map((item) => {
        const basePass = item.successRate >= 0.95 && (item.p95LatencyMs ?? Number.POSITIVE_INFINITY) <= 1200;
        if (item.market === "stock") {
          const drift = stockDriftSummary[item.provider as StockProviderName];
          const driftPass = typeof drift?.meanDriftBps === "number" && drift.meanDriftBps <= 30;
          return {
            provider: item.provider,
            market: item.market,
            pass: basePass && driftPass,
            reason: {
              successRate: item.successRate,
              p95LatencyMs: item.p95LatencyMs,
              meanDriftBps: drift?.meanDriftBps ?? null
            }
          };
        }
        return {
          provider: item.provider,
          market: item.market,
          pass: basePass,
          reason: {
            successRate: item.successRate,
            p95LatencyMs: item.p95LatencyMs
          }
        };
      })
    }
  };

  console.log("\n=== Provider Summary ===");
  for (const item of summaries) {
    console.log(
      `${item.market} ${item.provider}: enabled=${item.enabled} success=${(item.successRate * 100).toFixed(1)}% ` +
        `count=${item.successCount}/${item.totalCount} avg=${formatMs(item.avgLatencyMs)} ` +
        `p95=${formatMs(item.p95LatencyMs)}`
    );
    if (item.notes.length > 0) {
      for (const note of item.notes) {
        console.log(`  - ${note}`);
      }
    }
  }

  console.log("\n=== Accuracy Proxy ===");
  console.log(
    `fund(digmo_api vs fundgz_direct) meanDiff=${formatBps(avg(fundPairDiffBps))} ` +
      `maxDiff=${formatBps(fundPairDiffBps.length === 0 ? null : Math.max(...fundPairDiffBps))} ` +
      `samples=${fundPairDiffBps.length}`
  );
  for (const provider of stockProviders) {
    const drift = stockDriftSummary[provider];
    console.log(
      `stock ${provider}: meanDrift=${formatBps(drift.meanDriftBps)} ` +
        `maxDrift=${formatBps(drift.maxDriftBps)} samples=${drift.sampleCount}`
    );
  }

  const reportDir = path.resolve(process.cwd(), "src/demo/realtime-provider-poc/reports");
  await mkdir(reportDir, { recursive: true });
  const stamp = nowIso().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `report-${stamp}.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        config,
        summaries,
        stockDriftSummary,
        fundPairDiffBpsSummary: {
          mean: avg(fundPairDiffBps),
          max: fundPairDiffBps.length === 0 ? null : Math.max(...fundPairDiffBps),
          sampleCount: fundPairDiffBps.length
        },
        decision,
        samples
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`\nReport written: ${reportPath}`);
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
