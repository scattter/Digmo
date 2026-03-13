import { NextRequest, NextResponse } from "next/server";

const DEFAULT_API_UPSTREAM = "http://127.0.0.1:3001";
const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);

export const dynamic = "force-dynamic";

function getApiUpstream(): string {
  const raw = (process.env.API_UPSTREAM ?? DEFAULT_API_UPSTREAM).trim();
  const normalized = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  new URL(normalized);
  return normalized;
}

function buildTargetUrl(request: NextRequest, path: string[]): URL {
  const target = new URL(`${getApiUpstream()}/${path.join("/")}`);
  target.search = request.nextUrl.search;
  return target;
}

function copyRequestHeaders(headers: Headers): Headers {
  const copied = new Headers(headers);
  copied.delete("host");
  return copied;
}

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const headers = copyRequestHeaders(request.headers);
  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
    redirect: "manual"
  };

  if (!METHODS_WITHOUT_BODY.has(method)) {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  const response = await fetch(buildTargetUrl(request, path), init);
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
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
