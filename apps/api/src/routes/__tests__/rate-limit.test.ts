import Fastify from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createRateLimit } from "../middleware/rate-limit.js";
import { buildApp } from "../../app.js";
import { signAccessToken } from "../../modules/auth/token.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("request rate limit", () => {
  test("returns 429 with a retry time and admits requests after the window", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const app = Fastify();
    app.addHook("onRequest", createRateLimit({ max: 2, windowMs: 10_000 }));
    app.get("/test", () => ({ ok: true }));
    expect((await app.inject("/test")).statusCode).toBe(200);
    expect((await app.inject("/test")).statusCode).toBe(200);
    const blocked = await app.inject({ url: "/test", headers: { "x-forwarded-for": "1.2.3.4" } });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("10");
    now += 10_001;
    expect((await app.inject("/test")).statusCode).toBe(200);
    await app.close();
  });

  test("shares the account limit across IPs while keeping other accounts available", async () => {
    const app = Fastify();
    app.post("/login", {
      preHandler: createRateLimit({
        max: 1,
        key: (request) => (request.body as { username: string }).username.toLowerCase(),
      }),
    }, () => ({ ok: true }));
    expect((await app.inject({ method: "POST", url: "/login", payload: { username: "Admin" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/login", remoteAddress: "8.8.8.8", payload: { username: "admin" } })).statusCode).toBe(429);
    expect((await app.inject({ method: "POST", url: "/login", payload: { username: "alice" } })).statusCode).toBe(200);
    await app.close();
  });

  test("isolates proxy users, health and login from anonymous traffic without trusting spoofed tokens", async () => {
    const root = mkdtempSync(join(tmpdir(), "digmo-rate-limit-"));
    const secret = "rate-limit-test-secret";
    const password = "rate-limit-admin-password";
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("WATCHLIST_DB_PATH", join(root, "watchlist.sqlite"));
    vi.stubEnv("REDIS_ENABLED", "false");
    vi.stubEnv("AUTH_JWT_SECRET", secret);
    vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_USERNAME", "admin");
    vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_PASSWORD", password);
    const { app } = await buildApp();
    app.log.level = "silent";
    const url = "/v1/tasks/valuation/status";
    const payload = { sub: "user-one", username: "one", role: "user" as const };
    const userToken = signAccessToken(payload, secret, 3600);
    const otherToken = signAccessToken({ ...payload, sub: "user-two", username: "two" }, secret, 3600);
    try {
      for (let index = 0; index < 300; index++) {
        expect((await app.inject(url)).statusCode).toBe(200);
      }
      expect((await app.inject(url)).statusCode).toBe(429);
      for (const token of ["forged", signAccessToken(payload, "wrong-secret", 3600), signAccessToken(payload, secret, -1)]) {
        expect((await app.inject({ url, headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "8.8.8.8" } })).statusCode).toBe(429);
      }

      expect((await app.inject("/v1/health?probe=1")).statusCode).toBe(200);
      expect((await app.inject({ method: "HEAD", url: "/v1/health" })).statusCode).toBe(200);
      expect((await app.inject("/v1/health/unmatched")).statusCode).toBe(429);
      const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: "admin", password } });
      expect(login.statusCode).toBe(200);
      expect((await app.inject({ url: "/v1/auth/me", headers: { authorization: `Bearer ${login.json().accessToken}` } })).statusCode).toBe(200);

      for (let index = 0; index < 300; index++) {
        expect((await app.inject({ url, headers: { authorization: `Bearer ${userToken}` } })).statusCode).toBe(200);
      }
      expect((await app.inject({ url, headers: { authorization: `Bearer ${userToken}` } })).statusCode).toBe(429);
      expect((await app.inject({ url, headers: { authorization: `Bearer ${otherToken}` } })).statusCode).toBe(200);
      expect((await app.inject({ url: "/v1/auth/me", headers: { authorization: `Bearer ${otherToken}` } })).statusCode).toBe(401);

      for (let index = 0; index < 59; index++) {
        expect((await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: `unknown-${index}`, password: "wrong" } })).statusCode).toBe(401);
      }
      expect((await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: "unknown-new", password: "wrong" }, headers: { "x-forwarded-for": "8.8.8.8" } })).statusCode).toBe(429);
      expect((await app.inject("/v1/health")).statusCode).toBe(200);
      expect((await app.inject({ url, headers: { authorization: `Bearer ${otherToken}` } })).statusCode).toBe(200);
    } finally {
      await app.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
