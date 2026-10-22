import { ERROR_CODES } from "@digmo/shared";
import { FastifyInstance, preHandlerHookHandler } from "fastify";
import { SqliteWatchlistStore } from "../infra/watchlist/sqlite-watchlist-store.js";
import { signAccessToken } from "../modules/auth/token.js";
import { AppError } from "../utils/app-error.js";
import { createRequireAuth } from "./middleware/require-auth.js";
import { verifyPassword } from "../modules/auth/password.js";
import { createRateLimit } from "./middleware/rate-limit.js";

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

  app.post("/v1/auth/register", {
    preHandler: createRateLimit({ max: 5 }),
  }, async (request, reply) => {
    const body = request.body as { username?: unknown; password?: unknown } | null;
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password.trim() : "";
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, "用户名需为 3–32 位字母、数字、下划线或短横线", 400);
    }
    if (password.length < 12 || password.length > 128) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, "密码需为 12–128 个字符", 400);
    }
    if (await deps.store.getUserByUsername(username)) {
      throw new AppError(ERROR_CODES.DUPLICATE_USERNAME, "该用户名已被注册", 409);
    }

    try {
      const user = await deps.store.createUser({ username, password, role: "user", status: "active" });
      return reply.code(201).send({
        user: { id: user.id, username: user.username, role: user.role, status: user.status },
      });
    } catch (error) {
      // 并发注册可能同时通过前置检查，最终以数据库的唯一约束为准。
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed: app_user.username")) {
        throw new AppError(ERROR_CODES.DUPLICATE_USERNAME, "该用户名已被注册", 409);
      }
      throw error;
    }
  });

  app.post("/v1/auth/login", {
    preHandler: createRateLimit({
      max: 10,
      key: (request) => {
        const body = request.body as { username?: unknown } | null;
        return typeof body?.username === "string" ? body.username.trim().toLowerCase().slice(0, 200) : request.ip;
      },
    }),
  }, async (request) => {
    const body = request.body as { username?: unknown; password?: unknown };
    const username = parseNonEmptyString(body?.username, "username");
    const password = parseNonEmptyString(body?.password, "password");
    if (username.length > 200 || password.length > 1024) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, "用户名或密码过长", 400);
    }

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
