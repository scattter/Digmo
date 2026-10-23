// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const context = { params: Promise.resolve({ path: ["v1", "funds", "000001", "estimate"] }) };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("API proxy", () => {
  it.each([
    { method: "POST", path: ["v1", "portfolios", "p1", "daily-decision:generate"], delayMs: 75000, status: 200 },
    { method: "POST", path: ["v1", "portfolios", "p1", "daily-decision:generate"], delayMs: 310000, status: 504 },
    { method: "GET", path: ["v1", "portfolios", "p1", "daily-decision", "latest"], delayMs: 75000, status: 504 },
    { method: "POST", path: ["v1", "auth", "login"], delayMs: 75000, status: 504 },
  ])("handles $method $path with an upstream delay of $delayMs ms", async ({ method, path, delayMs, status }) => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((timeoutMs) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
      return controller.signal;
    });
    const fetchMock = vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response("{}")), delayMs);
      init.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(init.signal?.reason);
      }, { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest(`https://digmo.example/api/${path.join("/")}`, { method });
    const handler = method === "POST" ? POST : GET;
    const pending = handler(request, { params: Promise.resolve({ path }) });

    await vi.advanceTimersByTimeAsync(Math.min(delayMs, 300000));

    expect((await pending).status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves auth and queries without forwarding cookies or spoofed proxy headers", async () => {
    vi.stubEnv("API_UPSTREAM", "http://api:3001");
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      headers: { "content-type": "application/json", "content-encoding": "gzip", "content-length": "100", connection: "keep-alive" }
    }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("https://digmo.example/api/v1/funds/000001/estimate?fresh=true", {
      headers: { authorization: "Bearer sample", cookie: "private=value", "x-forwarded-for": "127.0.0.1", connection: "keep-alive" }
    });

    const response = await GET(request, context);

    expect(String(fetchMock.mock.calls[0][0])).toBe("http://api:3001/v1/funds/000001/estimate?fresh=true");
    const forwarded = fetchMock.mock.calls[0][1].headers as Headers;
    expect(forwarded.get("authorization")).toBe("Bearer sample");
    expect(forwarded.has("cookie")).toBe(false);
    expect(forwarded.has("x-forwarded-for")).toBe(false);
    expect(forwarded.has("connection")).toBe(false);
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(response.headers.has("content-length")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("rejects oversized chunked requests before contacting the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("https://digmo.example/api/v1/auth/login", {
      method: "POST",
      body: "x".repeat(1024 * 1024 + 1)
    });
    const response = await POST(request, context);
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps small JSON request bodies intact", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({ username: "admin", password: "sample" });
    const request = new NextRequest("https://digmo.example/api/v1/auth/login", {
      method: "POST", headers: { "content-type": "application/json" }, body
    });
    expect((await POST(request, context)).status).toBe(200);
    expect(new TextDecoder().decode(fetchMock.mock.calls[0][1].body)).toBe(body);
  });

  it("stops reading a cancelled request without forwarding a partial body", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    const request = new NextRequest("https://digmo.example/api/v1/auth/login", {
      method: "POST", body: "{}", signal: controller.signal
    });
    expect((await POST(request, context)).status).toBe(504);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[new Error("internal hostname: secret"), 502], [new DOMException("timeout", "TimeoutError"), 504]])(
    "returns a safe response for an unavailable or timed out upstream",
    async (error, status) => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
      const response = await GET(new NextRequest("https://digmo.example/api/v1/health"), context);
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("secret");
    }
  );
});
