import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildApp } from "../../app.js";
import { verifyPassword } from "../../modules/auth/password.js";

let root: string;
let dbPath: string;
let app: FastifyInstance;
const password = "registration-password-123";

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "digmo-register-"));
  dbPath = join(root, "watchlist.sqlite");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("WATCHLIST_DB_PATH", dbPath);
  vi.stubEnv("REDIS_ENABLED", "false");
  vi.stubEnv("AUTH_JWT_SECRET", "registration-test-secret");
  vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_USERNAME", "admin");
  vi.stubEnv("AUTH_BOOTSTRAP_ADMIN_PASSWORD", "test-admin-password");
  ({ app } = await buildApp());
  app.log.level = "silent";
});

afterEach(async () => {
  await app?.close();
  if (root) rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function register(username: string, extra: Record<string, unknown> = {}) {
  return app.inject({ method: "POST", url: "/v1/auth/register", payload: { username, password, ...extra } });
}

async function login(username: string) {
  const response = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { username, password } });
  expect(response.statusCode).toBe(200);
  return response.json().accessToken as string;
}

describe("self registration", () => {
  test("creates only an active regular user, hashes the password and then allows login", async () => {
    const response = await register(" Alice_01 ", { role: "admin", status: "disabled", id: "chosen-id", password: " " + password + " " });
    expect(response.statusCode).toBe(201);
    const { user } = response.json();
    expect(user).toEqual({ id: expect.any(String), username: "Alice_01", role: "user", status: "active" });
    expect(user.id).not.toBe("chosen-id");
    expect(response.json()).not.toHaveProperty("accessToken");
    expect(response.body).not.toContain("password");

    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const saved = db.prepare("SELECT password_hash FROM app_user WHERE id = ?").get(user.id) as { password_hash: string };
      expect(saved.password_hash).not.toBe(password);
      expect(verifyPassword(password, saved.password_hash)).toBe(true);
    } finally {
      db.close();
    }

    const token = await login("alice_01");
    const me = await app.inject({ url: "/v1/auth/me", headers: { authorization: "Bearer " + token } });
    expect(me.json().user).toEqual(user);
  });

  test("rejects existing usernames case-insensitively without changing their credentials", async () => {
    expect((await register("Alice")).statusCode).toBe(201);
    const duplicate = await register("alice", { password: "a-different-password" });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ code: "DUPLICATE_USERNAME", message: "该用户名已被注册" });
    await login("Alice");
    expect((await register("ADMIN")).statusCode).toBe(409);
  });

  test("maps a concurrent username collision to 409 instead of a server error", async () => {
    const responses = await Promise.all([register("Concurrent"), register("concurrent")]);
    expect(responses.map((item) => item.statusCode).sort()).toEqual([201, 409]);
    expect(responses.find((item) => item.statusCode === 409)?.json().code).toBe("DUPLICATE_USERNAME");
  });

  test.each([
    {},
    { username: "ab", password },
    { username: "a".repeat(33), password },
    { username: "invalid name", password },
    { username: "name@example.com", password },
    { username: ["alice"], password },
    { username: "alice", password: 123456789012 },
    { username: "alice", password: "short" },
    { username: "alice", password: " ".repeat(12) },
    { username: "alice", password: "x".repeat(129) },
  ])("rejects invalid registration data: %j", async (payload) => {
    const response = await app.inject({ method: "POST", url: "/v1/auth/register", payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_CREDENTIALS");
  });

  test("new users see only their own portfolios", async () => {
    await register("alice");
    await register("bob");
    const alice = { authorization: "Bearer " + await login("alice") };
    const bob = { authorization: "Bearer " + await login("bob") };
    const created = await app.inject({
      method: "POST", url: "/v1/portfolios", headers: alice, payload: { name: "Alice组合", type: "FREE" }
    });
    expect([200, 201]).toContain(created.statusCode);
    const aliceRows = (await app.inject({ url: "/v1/portfolios", headers: alice })).json().portfolios;
    const bobRows = (await app.inject({ url: "/v1/portfolios", headers: bob })).json().portfolios;
    expect(aliceRows).toHaveLength(1);
    expect(bobRows).toEqual([]);
    const denied = await app.inject({ url: "/v1/portfolios/" + aliceRows[0].id + "/funds", headers: bob });
    expect(denied.statusCode).toBe(404);
  });

  test("limits registration independently from login and other anonymous traffic", async () => {
    for (let index = 0; index < 300; index++) await app.inject("/v1/tasks/valuation/status");
    expect((await app.inject("/v1/tasks/valuation/status")).statusCode).toBe(429);
    for (let index = 0; index < 5; index++) {
      expect((await register("member" + index)).statusCode).toBe(201);
    }
    const blocked = await register("member6");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
    await login("member0");
    expect((await app.inject("/v1/health")).statusCode).toBe(200);
  });
});
