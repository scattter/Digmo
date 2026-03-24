import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
        mode: "chat_completions",
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
        mode: "chat_completions",
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
        mode: "chat_completions",
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
        mode: "responses",
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
        mode: "responses",
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
        mode: "chat_completions",
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
        mode: "responses",
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
        mode: "chat_completions",
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
        mode: "responses",
        hasApiKey: true,
        maskedApiKey: "sk-a*******4321",
        updatedAt: expect.any(String),
      },
    });

    await app.close();
  });

  test("requires explicit mode when saving decision ai config", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createApp(store);

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/decision-ai",
      payload: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "sk-test-1234567890",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_DECISION_AI_CONFIG",
      message: expect.stringContaining("mode"),
    });

    await app.close();
  });

  test("rejects unsupported decision ai mode", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createApp(store);

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/decision-ai",
      payload: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        mode: "auto",
        apiKey: "sk-test-1234567890",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_DECISION_AI_CONFIG",
      message: expect.stringContaining("mode"),
    });

    await app.close();
  });

  test("migrates legacy decision ai config rows by defaulting mode to chat_completions", async () => {
    const ctx = createTempCtx();
    const bootstrapStore = new SqliteWatchlistStore(ctx.dbPath);
    const admin = await bootstrapStore.getUserByUsername("admin");
    if (!admin) {
      throw new Error("bootstrap admin not found");
    }

    const db = new DatabaseSync(ctx.dbPath);
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("DROP TABLE IF EXISTS user_decision_ai_config;");
    db.exec(`
      CREATE TABLE user_decision_ai_config (
        user_id TEXT PRIMARY KEY,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
      );
    `);
    db.prepare(
      `
        INSERT INTO user_decision_ai_config (user_id, base_url, api_key, model, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
    ).run(admin.id, "https://api.openai.com/v1", "sk-legacy-123456", "gpt-4o-mini");
    db.exec("PRAGMA foreign_keys = ON;");

    const migratedStore = new SqliteWatchlistStore(ctx.dbPath);
    const config = await migratedStore.getDecisionAiConfig(admin.id);

    expect(config).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      mode: "chat_completions",
      hasApiKey: true,
    });
  });
});
