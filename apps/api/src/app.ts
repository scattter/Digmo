import { ERROR_CODES } from "@digmo/shared";
import cors from "@fastify/cors";
import Fastify, { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getConfig } from "./config.js";
import { MemoryCache } from "./infra/cache/memory-cache.js";
import { MemoryLockProvider } from "./infra/lock/memory-lock.js";
import { InMemoryRepository } from "./infra/repo/in-memory-repository.js";
import { SqliteWatchlistStore } from "./infra/watchlist/sqlite-watchlist-store.js";
import { SqliteDecisionStore } from "./infra/decision/sqlite-decision-store.js";
import { EastmoneyFundDataProvider } from "./modules/data/eastmoney-fund-provider.js";
import { OpenAIDecisionProvider } from "./modules/decision/openai-provider.js";
import { DecisionAIProviderFactory } from "./modules/decision/provider.js";
import { registerFundRoutes } from "./routes/funds.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerWatchlistRoutes } from "./routes/watchlist.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDecisionRoutes } from "./routes/decision.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { AppError } from "./utils/app-error.js";
import { ValuationScheduler } from "./modules/valuation/scheduler.js";
import { ValuationService } from "./modules/valuation/service.js";
import { ValuationTaskRunner } from "./modules/valuation/task.js";
import { createRequireAuth } from "./routes/middleware/require-auth.js";
import { createShareCache } from "./modules/share/cache.js";
import { ShareService } from "./modules/share/service.js";
import { createLoggerOptions } from "./infra/logging/logger.js";
import { createRateLimit } from "./routes/middleware/rate-limit.js";
import { ensureProductionPasswords } from "./modules/auth/production-auth.js";
import { verifyAccessToken } from "./modules/auth/token.js";

export interface AppContext {
  app: FastifyInstance;
  scheduler: ValuationScheduler;
  service: ValuationService;
}

export const CORS_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

function loadSystemPromptFromFile(filePath?: string): string | undefined {
  const trimmedPath = filePath?.trim();
  if (!trimmedPath) {
    return undefined;
  }

  const resolvedPath = resolve(trimmedPath);
  let content: string;
  try {
    content = readFileSync(resolvedPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      `failed to read DECISION_AI_SYSTEM_PROMPT_FILE (${resolvedPath}): ${detail}`,
    );
  }

  const normalized = content.trim();
  if (!normalized) {
    throw new Error(`DECISION_AI_SYSTEM_PROMPT_FILE is empty: ${resolvedPath}`);
  }
  return normalized;
}

export async function buildApp(): Promise<AppContext> {
  const config = getConfig();
  const app = Fastify({
    logger: createLoggerOptions(),
    bodyLimit: 1024 * 1024,
  });
  app.addHook("onRequest", createRateLimit({
    max: 300,
    skip: (request) =>
      (["GET", "HEAD"].includes(request.method) && request.routeOptions.url === "/v1/health") ||
      (request.method === "POST" && ["/v1/auth/login", "/v1/auth/register"].includes(request.routeOptions.url ?? "")),
    key: (request) => {
      const [scheme, token] = (request.headers.authorization ?? "").split(" ");
      if (scheme.toLowerCase() === "bearer" && token) {
        try {
          // 代理连接 IP 会共享；这里只隔离限流额度，私有路由仍独立查库鉴权。
          return `user:${verifyAccessToken(token, config.auth.jwtSecret).sub}`;
        } catch {
          // 无效或过期令牌不能获得独立额度。
        }
      }
      return `ip:${request.ip}`;
    },
  }));
  app.addHook("onRequest", createRateLimit({
    max: 60,
    skip: (request) => request.method !== "POST" || request.routeOptions.url !== "/v1/auth/login",
  }));
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
  });
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : !config.production,
    methods: [...CORS_METHODS],
  });

  const cache = new MemoryCache();
  const repository = new InMemoryRepository();
  const watchlistStore = new SqliteWatchlistStore(config.watchlist.dbPath, {
    bootstrapAdminUsername: config.auth.bootstrapAdminUsername,
    bootstrapAdminPassword: config.auth.bootstrapAdminPassword,
  });
  if (config.production) await ensureProductionPasswords(watchlistStore);
  const decisionStore = new SqliteDecisionStore(config.watchlist.dbPath);
  const shareCache = await createShareCache(config.redis, app.log);
  const shareService = new ShareService({
    store: watchlistStore,
    cache: shareCache,
    logger: app.log,
  });
  const lock = new MemoryLockProvider();
  const provider = new EastmoneyFundDataProvider(
    config.targetFunds,
    config.eastmoney,
  );

  const service = new ValuationService({
    provider,
    repository,
    cache,
  });

  const taskRunner = new ValuationTaskRunner({
    service,
    repository,
    lock,
    logger: app.log,
  });

  const scheduler = new ValuationScheduler(taskRunner);

  const requireAuth = createRequireAuth({
    store: watchlistStore,
    jwtSecret: config.auth.jwtSecret,
  });
  const systemPrompt = loadSystemPromptFromFile(
    config.decisionAi.systemPromptFile,
  );
  const decisionProviderFactory: DecisionAIProviderFactory = ({
    apiKey,
    baseUrl,
    model,
    mode,
  }) =>
    new OpenAIDecisionProvider({
      apiKey,
      baseUrl,
      model,
      mode,
      timeoutMs: config.decisionAi.openaiTimeoutMs,
      maxOutputTokens: config.decisionAi.openaiMaxTokens,
      systemPrompt,
      docMaxChars: config.decisionAi.docMaxChars,
      allowedOrigins: config.production
        ? watchlistStore.getDecisionAiAllowedOrigins() ?? config.decisionAi.allowedOrigins
        : undefined,
    });

  registerHealthRoutes(app);
  registerFundRoutes(app, { service });
  registerTaskRoutes(app, { repository });
  registerAuthRoutes(app, {
    store: watchlistStore,
    jwtSecret: config.auth.jwtSecret,
    accessTokenExpiresInSec: config.auth.accessTokenExpiresInSec,
    requireAuth,
  });
  registerSettingsRoutes(app, {
    store: watchlistStore,
    requireAuth,
    allowedOrigins: config.decisionAi.allowedOrigins,
  });
  registerWatchlistRoutes(app, {
    store: watchlistStore,
    decisionStore,
    service,
    shareService,
    requireAuth,
  });
  registerDecisionRoutes(app, {
    store: watchlistStore,
    decisionStore,
    service,
    providerFactory: decisionProviderFactory,
    requireAuth,
    timezone: config.timezone,
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        requestId: request.id,
        details: error.details,
      });
      return;
    }

    if (error instanceof Error && "statusCode" in error &&
      typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
      reply.status(error.statusCode).send({
        code: "code" in error && typeof error.code === "string" ? error.code : "BAD_REQUEST",
        message: error.message,
        requestId: request.id,
      });
      return;
    }

    app.log.error({ err: error, requestId: request.id }, "unhandled error");
    reply.status(500).send({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected server error",
      requestId: request.id,
    });
  });

  return {
    app,
    scheduler,
    service,
  };
}
