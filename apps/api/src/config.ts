import { ASIA_SHANGHAI_TIMEZONE } from "@digmo/shared";

export interface AppConfig {
  host: string;
  port: number;
  timezone: string;
  targetFunds: string[];
  watchlist: {
    dbPath: string;
  };
  eastmoney: {
    enabled: boolean;
    baseUrl: string;
    timeoutMs: number;
    userAgent: string;
    referer: string;
  };
  twelveData: {
    apiKey?: string;
    baseUrl: string;
    timeoutMs: number;
  };
}

export function getConfig(): AppConfig {
  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number(process.env.PORT ?? 3001);
  const timezone = process.env.TZ ?? ASIA_SHANGHAI_TIMEZONE;
  const targetFunds = (process.env.VALUATION_TARGET_FUNDS ?? "161725,110011,006327")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  const watchlistDbPath = process.env.WATCHLIST_DB_PATH ?? "./data/watchlist.sqlite";

  const eastmoneyEnabled = (process.env.EASTMONEY_ENABLED ?? "true").toLowerCase() === "true";

  return {
    host,
    port,
    timezone,
    targetFunds,
    watchlist: {
      dbPath: watchlistDbPath
    },
    eastmoney: {
      enabled: eastmoneyEnabled,
      baseUrl: process.env.EASTMONEY_BASE_URL ?? "https://push2delay.eastmoney.com",
      timeoutMs: Number(process.env.EASTMONEY_TIMEOUT_MS ?? 4000),
      userAgent:
        process.env.EASTMONEY_USER_AGENT ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      referer: process.env.EASTMONEY_REFERER ?? "https://quote.eastmoney.com/"
    },
    twelveData: {
      apiKey: process.env.TWELVEDATA_API_KEY,
      baseUrl: process.env.TWELVEDATA_BASE_URL ?? "https://api.twelvedata.com",
      timeoutMs: Number(process.env.TWELVEDATA_TIMEOUT_MS ?? 1800)
    }
  };
}
