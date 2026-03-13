import { AuthUser, ERROR_CODES } from "@digmo/shared";
import { preHandlerHookHandler } from "fastify";
import { SqliteWatchlistStore } from "../../infra/watchlist/sqlite-watchlist-store.js";
import { verifyAccessToken, TokenError } from "../../modules/auth/token.js";
import { AppError } from "../../utils/app-error.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

interface CreateRequireAuthDeps {
  store: SqliteWatchlistStore;
  jwtSecret: string;
}

function parseBearerToken(headerValue: string | undefined): string | undefined {
  if (!headerValue) {
    return undefined;
  }

  const [scheme, token] = headerValue.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return undefined;
  }

  return token.trim();
}

export function createRequireAuth(deps: CreateRequireAuthDeps): preHandlerHookHandler {
  return async (request) => {
    const token = parseBearerToken(request.headers.authorization);
    if (!token) {
      throw new AppError(ERROR_CODES.AUTH_REQUIRED, "authorization token is required", 401);
    }

    let payload;
    try {
      payload = verifyAccessToken(token, deps.jwtSecret);
    } catch (error) {
      if (error instanceof TokenError) {
        throw new AppError(ERROR_CODES.AUTH_INVALID_TOKEN, error.reason === "expired" ? "token expired" : "invalid token", 401);
      }
      throw error;
    }

    let user = await deps.store.getUserById(payload.sub);
    if (!user) {
      // In stateless multi-instance deployments, bootstrap users may have different local IDs.
      // Fallback to username+role keeps auth stable as long as the signed token is valid.
      const userByUsername = await deps.store.getUserByUsername(payload.username);
      if (!userByUsername || userByUsername.role !== payload.role) {
        throw new AppError(ERROR_CODES.AUTH_INVALID_TOKEN, "user in token is not found", 401);
      }
      user = userByUsername;
    }

    if (user.status !== "active") {
      throw new AppError(ERROR_CODES.USER_DISABLED, "user is disabled", 403);
    }

    request.authUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status
    };
  };
}
