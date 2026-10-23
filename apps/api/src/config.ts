import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { ASIA_SHANGHAI_TIMEZONE } from "@digmo/shared";

export interface AppConfig {
  production: boolean;
  host: string;
  port: number;
  timezone: string;
  targetFunds: string[];
  corsOrigins: string[];
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
    systemPromptFile?: string;
    docMaxChars: number;
    allowedOrigins?: string[];
  };
  auth: {
    jwtSecret: string;
    accessTokenExpiresInSec: number;
    bootstrapAdminUsername: string;
    bootstrapAdminPassword: string;
  };
  redis: {
    enabled: boolean;
    url?: string;
    keyPrefix: string;
    connectTimeoutMs: number;
  };
}

function toPositiveInt(raw: string | undefined, defaultValue: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.floor(parsed);
}

function parseOrigins(raw: string, httpsOnly: boolean): string[] {
  return [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean).map((value) => {
    const url = new URL(value);
    if ((httpsOnly ? url.protocol !== "https:" : !["http:", "https:"].includes(url.protocol)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error(`来源配置必须是${httpsOnly ? " HTTPS" : " HTTP(S)"} origin，不能包含路径、凭据或查询参数: ${value}`);
    }
    return url.origin;
  }))];
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
  const production = process.env.NODE_ENV === "production";
  const jwtSecret = process.env.AUTH_JWT_SECRET ?? "digmo-dev-change-this-secret";
  const bootstrapAdminPassword = process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD ?? "admin123456";
  if (production) {
    if (jwtSecret.trim().length < 32 || /^(digmo-dev-change-this-secret|change-this-in-production|change-me)$/i.test(jwtSecret.trim())) {
      throw new Error("生产环境必须设置至少 32 字符的随机 AUTH_JWT_SECRET");
    }
    if (bootstrapAdminPassword.trim().length < 12 || /^(admin123456|change-this-in-production|change-me)$/i.test(bootstrapAdminPassword.trim())) {
      throw new Error("生产环境必须设置至少 12 字符的 AUTH_BOOTSTRAP_ADMIN_PASSWORD，不能使用默认密码");
    }
  }
  const corsOrigins = parseOrigins(process.env.CORS_ORIGINS ?? "", false);
  const allowedOrigins = production
    ? parseOrigins(process.env.DECISION_AI_ALLOWED_ORIGINS ?? "https://api.openai.com", true)
    : undefined;
  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number(process.env.PORT ?? 3001);
  const timezone = process.env.TZ ?? ASIA_SHANGHAI_TIMEZONE;
  const targetFunds = (
    process.env.VALUATION_TARGET_FUNDS ?? ""
  )
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  const watchlistDbPath =
    process.env.WATCHLIST_DB_PATH ?? "./data/watchlist.sqlite";

  const eastmoneyEnabled =
    (process.env.EASTMONEY_ENABLED ?? "true").toLowerCase() === "true";
  const redisUrl = process.env.REDIS_URL?.trim();
  const redisEnabledRaw = (process.env.REDIS_ENABLED ?? "").trim().toLowerCase();
  const redisEnabled = redisEnabledRaw
    ? redisEnabledRaw !== "false"
    : Boolean(redisUrl);
  const decisionProviderRaw = (
    process.env.DECISION_AI_PROVIDER ?? "openai"
  ).toLowerCase();
  const decisionProvider =
    decisionProviderRaw === "openai" ? "openai" : "openai";

  return {
    production,
    host,
    port,
    timezone,
    targetFunds,
    corsOrigins,
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
      openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      openaiTimeoutMs: toPositiveInt(process.env.OPENAI_TIMEOUT_MS, 120_000),
      openaiMaxTokens: toPositiveInt(process.env.OPENAI_MAX_TOKENS, 16_384),
      systemPromptFile: process.env.DECISION_AI_SYSTEM_PROMPT_FILE,
      docMaxChars: toPositiveInt(process.env.DECISION_AI_DOC_MAX_CHARS, 12_000),
      allowedOrigins,
    },
    auth: {
      jwtSecret,
      accessTokenExpiresInSec: Number(
        process.env.AUTH_ACCESS_TOKEN_EXPIRES_IN_SEC ?? 43200,
      ),
      bootstrapAdminUsername:
        process.env.AUTH_BOOTSTRAP_ADMIN_USERNAME ?? "admin",
      bootstrapAdminPassword,
    },
    redis: {
      enabled: redisEnabled,
      url: redisUrl,
      keyPrefix: process.env.REDIS_KEY_PREFIX ?? "digmo:portfolio-share:",
      connectTimeoutMs: toPositiveInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 1000),
    },
  };
}
