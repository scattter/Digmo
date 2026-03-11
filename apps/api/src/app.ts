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
import { EastmoneyQuoteClient } from "./modules/data/eastmoney-client.js";
import { OpenAIDecisionProvider } from "./modules/decision/openai-provider.js";
import { registerFundRoutes } from "./routes/funds.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerWatchlistRoutes } from "./routes/watchlist.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDecisionRoutes } from "./routes/decision.js";
import { AppError } from "./utils/app-error.js";
import { ValuationScheduler } from "./modules/valuation/scheduler.js";
import { ValuationService } from "./modules/valuation/service.js";
import { ValuationTaskRunner } from "./modules/valuation/task.js";
import { createRequireAuth } from "./routes/middleware/require-auth.js";

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
    logger: {
      level: "info",
    },
  });
  await app.register(cors, {
    origin: true,
    methods: [...CORS_METHODS],
  });

  const cache = new MemoryCache();
  const repository = new InMemoryRepository();
  const watchlistStore = new SqliteWatchlistStore(config.watchlist.dbPath, {
    bootstrapAdminUsername: config.auth.bootstrapAdminUsername,
    bootstrapAdminPassword: config.auth.bootstrapAdminPassword,
  });
  const decisionStore = new SqliteDecisionStore(config.watchlist.dbPath);
  const lock = new MemoryLockProvider();
  const provider = new EastmoneyFundDataProvider(
    config.targetFunds,
    config.eastmoney,
  );
  const eastmoneyClient = new EastmoneyQuoteClient(config.eastmoney);

  const service = new ValuationService({
    provider,
    repository,
    cache,
    eastmoneyClient,
  });

  await service.bootstrap();

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
  const decisionProvider = new OpenAIDecisionProvider({
    apiKey: config.decisionAi.openaiApiKey,
    baseUrl: config.decisionAi.openaiBaseUrl,
    model: config.decisionAi.openaiModel,
    timeoutMs: config.decisionAi.openaiTimeoutMs,
    maxOutputTokens: config.decisionAi.openaiMaxTokens,
    enableWebSearch: config.decisionAi.enableWebSearch,
    systemPrompt,
    docMaxChars: config.decisionAi.docMaxChars,
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
  registerWatchlistRoutes(app, {
    store: watchlistStore,
    decisionStore,
    service,
    requireAuth,
  });
  registerDecisionRoutes(app, {
    store: watchlistStore,
    decisionStore,
    service,
    provider: decisionProvider,
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
