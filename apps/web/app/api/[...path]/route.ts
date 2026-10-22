import { NextRequest, NextResponse } from "next/server";

const DEFAULT_API_UPSTREAM = "http://127.0.0.1:3001";
const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);
const MAX_BODY_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 60_000;
const REQUEST_HEADERS = ["accept", "accept-language", "authorization", "content-type", "origin", "user-agent"];
const HOP_BY_HOP_HEADERS = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"];

export const dynamic = "force-dynamic";

function getApiUpstream(): string {
  const raw = (process.env.API_UPSTREAM ?? DEFAULT_API_UPSTREAM).trim();
  const normalized = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  const url = new URL(normalized);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("API_UPSTREAM must be an HTTP(S) URL without credentials, query, or fragment");
  }
  return normalized;
}

function buildTargetUrl(request: NextRequest, path: string[]): URL {
  const target = new URL(`${getApiUpstream()}/${path.map(encodeURIComponent).join("/")}`);
  target.search = request.nextUrl.search;
  return target;
}

function copyRequestHeaders(headers: Headers): Headers {
  const copied = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = headers.get(name);
    if (value !== null) copied.set(name, value);
  }
  return copied;
}

async function readBody(request: NextRequest, signal: AbortSignal): Promise<Uint8Array | undefined> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new RangeError("请求内容不能超过 1 MiB");
  }
  const reader = request.body?.getReader();
  if (!reader) return undefined;

  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("请求内容不能超过 1 MiB");
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }

  if (!size) return undefined;
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  try {
    const method = request.method.toUpperCase();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]);
    const init: RequestInit = {
      method,
      headers: copyRequestHeaders(request.headers),
      cache: "no-store",
      redirect: "manual",
      signal
    };

    if (!METHODS_WITHOUT_BODY.has(method)) {
      const body = await readBody(request, signal);
      if (body) init.body = body as BodyInit;
    }

    const response = await fetch(buildTargetUrl(request, path), init);
    const headers = new Headers(response.headers);
    for (const name of [...HOP_BY_HOP_HEADERS, "content-length", "content-encoding"]) headers.delete(name);
    // fetch decodes upstream bodies; encoded lengths and compression headers no longer match.
    headers.set("cache-control", "no-store");
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ message: error.message }, { status: 413 });
    }
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return NextResponse.json(
      { message: timedOut ? "接口响应超时，请稍后重试" : "暂时无法连接 API 服务，请稍后重试" },
      { status: timedOut ? 504 : 502 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}
