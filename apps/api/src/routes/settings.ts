import { DecisionAiMode, ERROR_CODES, UserDecisionAiConfigSummary } from "@digmo/shared";
import { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import { WatchlistStore } from "../infra/watchlist/sqlite-watchlist-store.js";
import { AppError } from "../utils/app-error.js";

interface RegisterSettingsRoutesDeps {
  store: WatchlistStore;
  requireAuth: preHandlerHookHandler;
}

function requireUserId(request: FastifyRequest): string {
  const userId = request.authUser?.id?.trim();
  if (!userId) {
    throw new AppError(ERROR_CODES.AUTH_REQUIRED, "authentication is required", 401);
  }
  return userId;
}

function parseRequiredString(raw: unknown, fieldName: string, maxLength: number): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new AppError(ERROR_CODES.INVALID_DECISION_AI_CONFIG, `${fieldName} is required`, 400);
  }
  if (value.length > maxLength) {
    throw new AppError(
      ERROR_CODES.INVALID_DECISION_AI_CONFIG,
      `${fieldName} length must be <= ${maxLength}`,
      400,
    );
  }
  return value;
}

function parseOptionalApiKey(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const value = typeof raw === "string" ? raw.trim() : "";
  return value || undefined;
}

function parseDecisionAiMode(raw: unknown): DecisionAiMode {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "responses" || value === "chat_completions") {
    return value;
  }

  throw new AppError(ERROR_CODES.INVALID_DECISION_AI_CONFIG, "mode must be responses or chat_completions", 400);
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return "*".repeat(apiKey.length);
  }
  return `${apiKey.slice(0, 4)}${"*".repeat(apiKey.length - 8)}${apiKey.slice(-4)}`;
}

function toDecisionAiConfigSummary(input: {
  baseUrl: string;
  model: string;
  mode: DecisionAiMode;
  apiKey: string;
  updatedAt: string;
}): UserDecisionAiConfigSummary {
  return {
    baseUrl: input.baseUrl,
    model: input.model,
    mode: input.mode,
    hasApiKey: true,
    maskedApiKey: maskApiKey(input.apiKey),
    updatedAt: input.updatedAt,
  };
}

export function registerSettingsRoutes(app: FastifyInstance, deps: RegisterSettingsRoutesDeps): void {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", deps.requireAuth);

    protectedApp.get("/v1/settings/decision-ai", async (request) => {
      const userId = requireUserId(request);
      const config = await deps.store.getDecisionAiConfig(userId);
      return {
        config: config ? toDecisionAiConfigSummary(config) : null,
      };
    });

    protectedApp.patch("/v1/settings/decision-ai", async (request) => {
      const userId = requireUserId(request);
      const body = request.body as {
        baseUrl?: unknown;
        model?: unknown;
        mode?: unknown;
        apiKey?: unknown;
      };
      const baseUrl = parseRequiredString(body?.baseUrl, "baseUrl", 500);
      const model = parseRequiredString(body?.model, "model", 200);
      const mode = parseDecisionAiMode(body?.mode);
      const apiKey = parseOptionalApiKey(body?.apiKey);
      const existingConfig = await deps.store.getDecisionAiConfig(userId);

      if (!existingConfig && !apiKey) {
        throw new AppError(
          ERROR_CODES.INVALID_DECISION_AI_CONFIG,
          "apiKey is required when saving decision ai config for the first time",
          400,
        );
      }

      const savedConfig = await deps.store.upsertDecisionAiConfig(userId, {
        baseUrl,
        model,
        mode,
        apiKey: apiKey ?? existingConfig!.apiKey,
      });

      return {
        config: toDecisionAiConfigSummary(savedConfig),
      };
    });
  });
}
