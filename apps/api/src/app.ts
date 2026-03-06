import { ERROR_CODES } from "@digmo/shared";
import cors from "@fastify/cors";
import Fastify, { FastifyInstance } from "fastify";
import { getConfig } from "./config";
import { MemoryCache } from "./infra/cache/memory-cache";
import { MemoryLockProvider } from "./infra/lock/memory-lock";
import { InMemoryRepository } from "./infra/repo/in-memory-repository";
import { SqliteWatchlistStore } from "./infra/watchlist/sqlite-watchlist-store";
import { EastmoneyFundDataProvider } from "./modules/data/eastmoney-fund-provider";
import { EastmoneyQuoteClient } from "./modules/data/eastmoney-client";
import { registerFundRoutes } from "./routes/funds";
import { registerHealthRoutes } from "./routes/health";
import { registerTaskRoutes } from "./routes/tasks";
import { registerWatchlistRoutes } from "./routes/watchlist";
import { registerAuthRoutes } from "./routes/auth";
import { AppError } from "./utils/app-error";
import { ValuationScheduler } from "./modules/valuation/scheduler";
import { ValuationService } from "./modules/valuation/service";
import { ValuationTaskRunner } from "./modules/valuation/task";
import { createRequireAuth } from "./routes/middleware/require-auth";

export interface AppContext {
  app: FastifyInstance;
  scheduler: ValuationScheduler;
  service: ValuationService;
}

export async function buildApp(): Promise<AppContext> {
  const config = getConfig();
  const app = Fastify({
    logger: {
      level: "info"
    }
  });
  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  });

  const cache = new MemoryCache();
  const repository = new InMemoryRepository();
  const watchlistStore = new SqliteWatchlistStore(config.watchlist.dbPath, {
    bootstrapAdminUsername: config.auth.bootstrapAdminUsername,
    bootstrapAdminPassword: config.auth.bootstrapAdminPassword
  });
  const lock = new MemoryLockProvider();
  const provider = new EastmoneyFundDataProvider(config.targetFunds, config.eastmoney);
  const eastmoneyClient = new EastmoneyQuoteClient(config.eastmoney);

  const service = new ValuationService({
    provider,
    repository,
    cache,
    eastmoneyClient
  });

  await service.bootstrap();

  const taskRunner = new ValuationTaskRunner({
    service,
    repository,
    lock,
    logger: app.log
  });

  const scheduler = new ValuationScheduler(taskRunner);

  const requireAuth = createRequireAuth({
    store: watchlistStore,
    jwtSecret: config.auth.jwtSecret
  });

  registerHealthRoutes(app);
  registerFundRoutes(app, { service });
  registerTaskRoutes(app, { repository });
  registerAuthRoutes(app, {
    store: watchlistStore,
    jwtSecret: config.auth.jwtSecret,
    accessTokenExpiresInSec: config.auth.accessTokenExpiresInSec,
    requireAuth
  });
  registerWatchlistRoutes(app, {
    store: watchlistStore,
    service,
    requireAuth,
    twelveData: {
      apiKey: config.twelveData.apiKey,
      baseUrl: config.twelveData.baseUrl,
      timeoutMs: config.twelveData.timeoutMs
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        requestId: request.id,
        details: error.details
      });
      return;
    }

    app.log.error({ err: error, requestId: request.id }, "unhandled error");
    reply.status(500).send({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected server error",
      requestId: request.id
    });
  });

  return {
    app,
    scheduler,
    service
  };
}
