import { ERROR_CODES } from "@digmo/shared";
import { FastifyInstance, preHandlerHookHandler } from "fastify";
import { SqliteWatchlistStore } from "../infra/watchlist/sqlite-watchlist-store.js";
import { signAccessToken } from "../modules/auth/token.js";
import { AppError } from "../utils/app-error.js";
import { createRequireAuth } from "./middleware/require-auth.js";
import { verifyPassword } from "../modules/auth/password.js";

interface RegisterAuthRoutesDeps {
  store: SqliteWatchlistStore;
  jwtSecret: string;
  accessTokenExpiresInSec: number;
  requireAuth?: preHandlerHookHandler;
}

function parseNonEmptyString(value: unknown, field: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, `${field} is required`, 400);
  }
  return normalized;
}

export function registerAuthRoutes(app: FastifyInstance, deps: RegisterAuthRoutesDeps): void {
  const requireAuth = deps.requireAuth ?? createRequireAuth({ store: deps.store, jwtSecret: deps.jwtSecret });

  app.post("/v1/auth/login", async (request) => {
    const body = request.body as { username?: unknown; password?: unknown };
    const username = parseNonEmptyString(body?.username, "username");
    const password = parseNonEmptyString(body?.password, "password");

    const user = await deps.store.getUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, "username or password is invalid", 401);
    }

    if (user.status !== "active") {
      throw new AppError(ERROR_CODES.USER_DISABLED, "user is disabled", 403);
    }

    const accessToken = signAccessToken(
      {
        sub: user.id,
        username: user.username,
        role: user.role
      },
      deps.jwtSecret,
      deps.accessTokenExpiresInSec
    );

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: deps.accessTokenExpiresInSec,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status
      }
    };
  });

  app.get(
    "/v1/auth/me",
    {
      preHandler: requireAuth
    },
    async (request) => {
      if (!request.authUser) {
        throw new AppError(ERROR_CODES.AUTH_REQUIRED, "authorization token is required", 401);
      }

      return {
        user: request.authUser
      };
    }
  );
}
