import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, test } from "vitest";
import { SqliteWatchlistStore } from "../../infra/watchlist/sqlite-watchlist-store.js";
import { registerAuthRoutes } from "../auth.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { registerSettingsRoutes } from "../settings.js";
import { signAccessToken } from "../../modules/auth/token.js";

interface TestCtx {
  root: string;
  dbPath: string;
}

const tempRoots: string[] = [];
const TEST_JWT_SECRET = "digmo-test-jwt-secret";

function createTempCtx(): TestCtx {
  const root = mkdtempSync(join(tmpdir(), "digmo-settings-test-"));
  const dbPath = join(root, "watchlist.sqlite");
  tempRoots.push(root);
  return { root, dbPath };
}

async function issueToken(store: SqliteWatchlistStore, username: string): Promise<string> {
  const user = await store.getUserByUsername(username);
  if (!user) {
    throw new Error(`user not found: ${username}`);
  }

  return signAccessToken(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
    },
    TEST_JWT_SECRET,
    3600,
  );
}

async function createApp(store: SqliteWatchlistStore) {
  const app = Fastify({ logger: false });

  const requireAuth = createRequireAuth({
    store,
    jwtSecret: TEST_JWT_SECRET,
  });

  registerAuthRoutes(app, {
    store,
    jwtSecret: TEST_JWT_SECRET,
    accessTokenExpiresInSec: 3600,
    requireAuth,
  });
  registerSettingsRoutes(app, {
    store,
    requireAuth,
  });

  const adminToken = await issueToken(store, "admin");
  app.addHook("onRequest", async (request) => {
    if (!request.headers.authorization) {
      request.headers.authorization = `Bearer ${adminToken}`;
    }
  });

  await app.ready();
  return app;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("settings routes", () => {
  test("returns null when decision ai config is not set", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createApp(store);

    const response = await app.inject({
      method: "GET",
      url: "/v1/settings/decision-ai",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ config: null });

    await app.close();
  });

  test("requires api key when saving decision ai config for the first time", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createApp(store);

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/decision-ai",
      payload: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_DECISION_AI_CONFIG",
    });

    await app.close();
  });

  test("masks api key and preserves the existing key on later updates", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createApp(store);

    const saveResponse = await app.inject({
      method: "PATCH",
      url: "/v1/settings/decision-ai",
      payload: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "sk-test-1234567890",
      },
    });
    expect(saveResponse.statusCode).toBe(200);

    const initialReadResponse = await app.inject({
      method: "GET",
      url: "/v1/settings/decision-ai",
    });
    expect(initialReadResponse.statusCode).toBe(200);
    expect(initialReadResponse.json()).toEqual({
      config: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        hasApiKey: true,
        maskedApiKey: "sk-t**********7890",
        updatedAt: expect.any(String),
      },
    });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/v1/settings/decision-ai",
      payload: {
        baseUrl: "https://openrouter.ai/api/v1",
        model: "claude-3.7-sonnet",
        apiKey: "",
      },
    });
    expect(updateResponse.statusCode).toBe(200);

    const readAfterUpdateResponse = await app.inject({
      method: "GET",
      url: "/v1/settings/decision-ai",
    });
    expect(readAfterUpdateResponse.statusCode).toBe(200);
    expect(readAfterUpdateResponse.json()).toEqual({
      config: {
        baseUrl: "https://openrouter.ai/api/v1",
        model: "claude-3.7-sonnet",
        hasApiKey: true,
        maskedApiKey: "sk-t**********7890",
        updatedAt: expect.any(String),
      },
    });

    await app.close();
  });

  test("stores decision ai config per user", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    await store.createUser({
      username: "alice",
      password: "alice123456",
      role: "user",
    });
    const app = await createApp(store);
    const aliceToken = await issueToken(store, "alice");

    const adminSaveResponse = await app.inject({
      method: "PATCH",
      url: "/v1/settings/decision-ai",
      payload: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "sk-admin-123456",
      },
    });
    expect(adminSaveResponse.statusCode).toBe(200);

    const aliceSaveResponse = await app.inject({
      method: "PATCH",
      url: "/v1/settings/decision-ai",
      headers: {
        authorization: `Bearer ${aliceToken}`,
      },
      payload: {
        baseUrl: "https://openrouter.ai/api/v1",
        model: "gemini-2.5-pro",
        apiKey: "sk-alice-654321",
      },
    });
    expect(aliceSaveResponse.statusCode).toBe(200);

    const adminReadResponse = await app.inject({
      method: "GET",
      url: "/v1/settings/decision-ai",
    });
    expect(adminReadResponse.statusCode).toBe(200);
    expect(adminReadResponse.json()).toEqual({
      config: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        hasApiKey: true,
        maskedApiKey: "sk-a*******3456",
        updatedAt: expect.any(String),
      },
    });

    const aliceReadResponse = await app.inject({
      method: "GET",
      url: "/v1/settings/decision-ai",
      headers: {
        authorization: `Bearer ${aliceToken}`,
      },
    });
    expect(aliceReadResponse.statusCode).toBe(200);
    expect(aliceReadResponse.json()).toEqual({
      config: {
        baseUrl: "https://openrouter.ai/api/v1",
        model: "gemini-2.5-pro",
        hasApiKey: true,
        maskedApiKey: "sk-a*******4321",
        updatedAt: expect.any(String),
      },
    });

    await app.close();
  });
});
