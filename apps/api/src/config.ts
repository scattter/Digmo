import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
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
  decisionAi: {
    provider: "openai";
    openaiApiKey?: string;
    openaiBaseUrl: string;
    openaiModel: string;
    openaiTimeoutMs: number;
    openaiMaxTokens: number;
    enableWebSearch: boolean;
    systemPromptFile?: string;
    docMaxChars: number;
  };
  auth: {
    jwtSecret: string;
    accessTokenExpiresInSec: number;
    bootstrapAdminUsername: string;
    bootstrapAdminPassword: string;
  };
}

function toPositiveInt(raw: string | undefined, defaultValue: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.floor(parsed);
}

export function loadEnvFromDotEnvIfPresent(filePath = ".env"): void {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    return;
  }
  loadEnvFile(resolvedPath);
}

loadEnvFromDotEnvIfPresent();

export function getConfig(): AppConfig {
  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number(process.env.PORT ?? 3001);
  const timezone = process.env.TZ ?? ASIA_SHANGHAI_TIMEZONE;
  const targetFunds = (
    process.env.VALUATION_TARGET_FUNDS ?? "161725,110011,006327"
  )
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  const watchlistDbPath =
    process.env.WATCHLIST_DB_PATH ?? "./data/watchlist.sqlite";

  const eastmoneyEnabled =
    (process.env.EASTMONEY_ENABLED ?? "true").toLowerCase() === "true";
  const decisionProviderRaw = (
    process.env.DECISION_AI_PROVIDER ?? "openai"
  ).toLowerCase();
  const decisionProvider =
    decisionProviderRaw === "openai" ? "openai" : "openai";

  return {
    host,
    port,
    timezone,
    targetFunds,
    watchlist: {
      dbPath: watchlistDbPath,
    },
    eastmoney: {
      enabled: eastmoneyEnabled,
      baseUrl:
        process.env.EASTMONEY_BASE_URL ?? "https://push2delay.eastmoney.com",
      timeoutMs: Number(process.env.EASTMONEY_TIMEOUT_MS ?? 4000),
      userAgent:
        process.env.EASTMONEY_USER_AGENT ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      referer: process.env.EASTMONEY_REFERER ?? "https://quote.eastmoney.com/",
    },
    decisionAi: {
      provider: decisionProvider,
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
      openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      openaiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 12000),
      openaiMaxTokens: Number(process.env.OPENAI_MAX_TOKENS ?? 1600),
      enableWebSearch:
        (process.env.OPENAI_ENABLE_WEB_SEARCH ?? "true").toLowerCase() !==
        "false",
      systemPromptFile: process.env.DECISION_AI_SYSTEM_PROMPT_FILE,
      docMaxChars: toPositiveInt(process.env.DECISION_AI_DOC_MAX_CHARS, 12_000),
    },
    auth: {
      jwtSecret: process.env.AUTH_JWT_SECRET ?? "digmo-dev-change-this-secret",
      accessTokenExpiresInSec: Number(
        process.env.AUTH_ACCESS_TOKEN_EXPIRES_IN_SEC ?? 43200,
      ),
      bootstrapAdminUsername:
        process.env.AUTH_BOOTSTRAP_ADMIN_USERNAME ?? "admin",
      bootstrapAdminPassword:
        process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD ?? "admin123456",
    },
  };
}
