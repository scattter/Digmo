import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getConfig } from "../config.js";
import { SqliteWatchlistStore } from "../infra/watchlist/sqlite-watchlist-store.js";
import { SqliteDecisionStore } from "../infra/decision/sqlite-decision-store.js";
import { ensureProductionPasswords } from "../modules/auth/production-auth.js";
import { verifyPassword } from "../modules/auth/password.js";
import { validateDecisionBaseUrl } from "../modules/decision/base-url.js";
import { OpenAIDecisionProvider } from "../modules/decision/openai-provider.js";
import { buildApp } from "../app.js";

const roots: string[] = [];
function makeStore(password?: string) {
  const root = mkdtempSync(join(tmpdir(), "digmo-security-"));
  roots.push(root);
  const path = join(root, "watchlist.sqlite");
  return { path, store: new SqliteWatchlistStore(path, { bootstrapAdminPassword: password }) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("production security", () => {
  test("rejects missing or default credentials in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_JWT_SECRET", "digmo-dev-change-this-secret");
    vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_PASSWORD", "a-secure-admin-password");
    expect(() => getConfig()).toThrow("AUTH_JWT_SECRET");
    vi.stubEnv("AUTH_JWT_SECRET", "secure-random-signing-key-with-32-characters");
    vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_PASSWORD", "admin123456");
    expect(() => getConfig()).toThrow("AUTH_BOOTSTRAP_ADMIN_PASSWORD");
  });

  test("uses explicit CORS and AI origin allowlists in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_JWT_SECRET", "secure-random-signing-key-with-32-characters");
    vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_PASSWORD", "a-secure-admin-password");
    vi.stubEnv("CORS_ORIGINS", "");
    vi.stubEnv("DECISION_AI_ALLOWED_ORIGINS", undefined);
    const config = getConfig();
    expect(config.corsOrigins).toEqual([]);
    expect(config.decisionAi.allowedOrigins).toEqual(["https://api.openai.com"]);
    vi.stubEnv("DECISION_AI_ALLOWED_ORIGINS", "https://compat.example.com,https://api.openai.com");
    expect(getConfig().decisionAi.allowedOrigins).toContain("https://compat.example.com");
    vi.stubEnv("DECISION_AI_ALLOWED_ORIGINS", "https://compat.example.com/v1");
    expect(() => getConfig()).toThrow("origin");
  });

  test.each([
    "http://api.openai.com/v1",
    "https://api.openai.com.evil.example/v1",
    "https://api.openai.com@evil.example/v1",
    "https://127.0.0.1/v1",
    "https://api.openai.com:8443/v1",
    "https://api.openai.com/v1?target=127.0.0.1",
    "https://api.openai.com/v1#anything",
  ])("rejects unapproved AI URL %s", (url) => {
    expect(() => validateDecisionBaseUrl(url, ["https://api.openai.com"])).toThrow();
  });

  test("accepts an approved HTTPS service path and development localhost", () => {
    expect(validateDecisionBaseUrl("https://api.openai.com/v1/", ["https://api.openai.com"]))
      .toBe("https://api.openai.com/v1");
    expect(validateDecisionBaseUrl("http://127.0.0.1:8000/v1")).toBe("http://127.0.0.1:8000/v1");
  });

  test("detects a weak existing account and CLI can recover without valid production config", async () => {
    const { path, store } = makeStore();
    const before = await store.getUserByUsername("admin");
    await expect(ensureProductionPasswords(store)).rejects.toThrow("user:password");

    const output = execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "user:password", "--username", "ADMIN"], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: {
        ...process.env,
        NODE_ENV: "production",
        WATCHLIST_DB_PATH: path,
        AUTH_JWT_SECRET: "",
        AUTH_BOOTSTRAP_ADMIN_USERNAME: "must-not-be-created",
        AUTH_BOOTSTRAP_ADMIN_PASSWORD: "",
        USER_PASSWORD: "replacement-password-123",
      },
      encoding: "utf8",
    });
    expect(JSON.parse(output)).toEqual({ ok: true, username: "ADMIN" });
    const after = await store.getUserByUsername("admin");
    expect(after?.id).toBe(before?.id);
    expect(verifyPassword("replacement-password-123", after!.passwordHash)).toBe(true);
    expect(await store.listUsers()).toHaveLength(1);
    await expect(ensureProductionPasswords(store)).resolves.toBeUndefined();
  });

  test("production app enforces the allowlist, credentials, body limit and login rate limit", async () => {
    const password = "a-secure-admin-password";
    const { path } = makeStore(password);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_JWT_SECRET", "secure-random-signing-key-with-32-characters");
    vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_USERNAME", "admin");
    vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_PASSWORD", password);
    vi.stubEnv("WATCHLIST_DB_PATH", path);
    vi.stubEnv("REDIS_ENABLED", "false");
    vi.stubEnv("CORS_ORIGINS", "");
    vi.stubEnv("DECISION_AI_ALLOWED_ORIGINS", "https://api.openai.com");
    const { app } = await buildApp();
    app.log.level = "silent";
    try {
      const health = await app.inject({ url: "/v1/health", headers: { origin: "https://unknown.example" } });
      expect(health.headers["access-control-allow-origin"]).toBeUndefined();
      expect(health.headers["cache-control"]).toBe("no-store");
      expect((await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: "admin", password: "x".repeat(1024 * 1024) } })).statusCode).toBe(413);
      const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: "admin", password } });
      expect(login.statusCode).toBe(200);
      const settings = await app.inject({
        method: "PATCH", url: "/v1/settings/decision-ai",
        headers: { authorization: `Bearer ${login.json().accessToken}` },
        payload: { baseUrl: "http://127.0.0.1:8080/v1", model: "test", mode: "chat_completions", apiKey: "test" },
      });
      expect(settings.statusCode).toBe(400);
      for (let index = 0; index < 9; index++) {
        expect((await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: "ADMIN", password: "wrong-password" } })).statusCode).toBe(401);
      }
      const limited = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: "admin", password } });
      expect(limited.statusCode).toBe(429);
      expect(limited.headers["retry-after"]).toBeDefined();
    } finally {
      await app.close();
    }
  });

  test("production AI calls use the latest saved allowlist and keep it across app restarts", async () => {
    const password = "a-secure-admin-password";
    const { path, store } = makeStore(password);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_JWT_SECRET", "secure-random-signing-key-with-32-characters");
    vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_USERNAME", "admin");
    vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_PASSWORD", password);
    vi.stubEnv("WATCHLIST_DB_PATH", path);
    vi.stubEnv("REDIS_ENABLED", "false");
    vi.stubEnv("CORS_ORIGINS", "");
    vi.stubEnv("DECISION_AI_ALLOWED_ORIGINS", "https://api.openai.com");
    const admin = (await store.getUserByUsername("admin"))!;
    const portfolio = await store.createPortfolio(admin.id, "测试组合", "FREE");
    await store.upsertPortfolioFund(admin.id, { portfolioId: portfolio.id, fundCode: "000001", holdingAmount: 100 });
    await store.upsertDecisionAiConfig(admin.id, {
      baseUrl: "https://compat.example.com/v1", model: "test", mode: "chat_completions", apiKey: "test-key",
    });
    await new SqliteDecisionStore(path).upsertDecisionDoc(admin.id, portfolio.id, { format: "TEXT", content: "测试分析" });
    const generate = vi.spyOn(OpenAIDecisionProvider.prototype, "generateDailyDecision").mockResolvedValue({ summary: "测试建议" });
    const { app, service } = await buildApp();
    app.log.level = "silent";
    vi.spyOn(service, "getBatchEstimates").mockResolvedValue({
      data: [{
        fundCode: "000001", officialNav: 1, estimateNav: 1, estimateChangePct: 0,
        baseNavDate: "2026-01-01", estimateTime: new Date().toISOString(),
        confidenceLevel: "HIGH", confidenceScore: 100, method: "FUND_GZ_DIRECT",
        inputsStalenessSec: 0, topHoldings: [], disclaimer: "test",
      }],
      partialFailed: [],
    });
    let authorization: string;
    try {
      const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: "admin", password } });
      authorization = `Bearer ${login.json().accessToken}`;
      const requestDecision = () => app.inject({
        method: "POST", url: `/v1/portfolios/${portfolio.id}/daily-decision:generate`, headers: { authorization },
      });
      expect((await requestDecision()).json().code).toBe("INVALID_DECISION_AI_CONFIG");
      expect(generate).not.toHaveBeenCalled();
      const saved = await app.inject({
        method: "PUT", url: "/v1/settings/decision-ai/allowed-origins", headers: { authorization },
        payload: { allowedOrigins: ["https://compat.example.com"] },
      });
      expect(saved.statusCode).toBe(200);
      expect((await requestDecision()).statusCode).toBe(200);
      expect(generate).toHaveBeenCalledTimes(1);
      const cleared = await app.inject({
        method: "PUT", url: "/v1/settings/decision-ai/allowed-origins", headers: { authorization }, payload: { allowedOrigins: [] },
      });
      expect(cleared.statusCode).toBe(200);
      const rejected = await requestDecision();
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json().code).toBe("INVALID_DECISION_AI_CONFIG");
      expect(generate).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
    const { app: restarted } = await buildApp();
    restarted.log.level = "silent";
    try {
      const response = await restarted.inject({ url: "/v1/settings/decision-ai/allowed-origins", headers: { authorization } });
      expect(response.json()).toEqual({ allowedOrigins: [], enforced: true });
    } finally {
      await restarted.close();
    }
  });

  test("user:create accepts USER_PASSWORD and lets an explicit password take precedence", async () => {
    const { path, store } = makeStore("a-secure-admin-password");
    const env = {
      ...process.env,
      NODE_ENV: "production",
      WATCHLIST_DB_PATH: path,
      AUTH_JWT_SECRET: "secure-random-signing-key-with-32-characters",
      AUTH_BOOTSTRAP_ADMIN_USERNAME: "admin",
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: "a-secure-admin-password",
      USER_PASSWORD: "password-from-env-123",
    };
    for (const [username, args, expectedPassword] of [
      ["env-user", [], "password-from-env-123"],
      ["arg-user", ["--password", "password-from-arg-123"], "password-from-arg-123"],
    ] as const) {
      const output = execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "user:create", "--username", username, ...args], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)), env, encoding: "utf8",
      });
      expect(JSON.parse(output)).toMatchObject({ ok: true, user: { username } });
      expect(output).not.toContain(expectedPassword);
      const saved = await store.getUserByUsername(username);
      expect(verifyPassword(expectedPassword, saved!.passwordHash)).toBe(true);
    }
    expect(await store.listUsers()).toHaveLength(3);
  });
});
