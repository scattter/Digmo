import { AuthUser, ERROR_CODES } from "@digmo/shared";
import { preHandlerHookHandler } from "fastify";
import { SqliteWatchlistStore } from "../../infra/watchlist/sqlite-watchlist-store";
import { verifyAccessToken, TokenError } from "../../modules/auth/token";
import { AppError } from "../../utils/app-error";

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

    const user = await deps.store.getUserById(payload.sub);
    if (!user) {
      throw new AppError(ERROR_CODES.AUTH_INVALID_TOKEN, "user in token is not found", 401);
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
