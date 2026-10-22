import type { AuthUser } from "@/shared";
import { AppError } from "./utils/app-error";

export interface FastifyRequest {
  body: unknown;
  params: Record<string, string>;
  query: Record<string, string>;
  authUser?: AuthUser;
}
class Reply {
  statusCode = 200;
  code(value: number) { this.statusCode = value; return this; }
}
type Handler = (request: FastifyRequest, reply: Reply) => unknown | Promise<unknown>;
export type preHandlerHookHandler = Handler;
type Route = { method: string; parts: string[]; handler: Handler; hooks: Handler[] };

// Adapts the existing validated route handlers to Fetch; no HTTP server remains.
export class FastifyInstance {
  private routes: Route[] = [];
  private hooks: Handler[] = [];
  private registrations: Promise<void>[] = [];
  register(callback: (app: FastifyInstance) => Promise<void>) {
    const child = new FastifyInstance();
    this.registrations.push(callback(child).then(async () => {
      await child.ready();
      this.routes.push(...child.routes);
    }));
  }
  addHook(_name: "preHandler", hook: Handler) { this.hooks.push(hook); }
  private route(method: string, path: string, handler: Handler) {
    this.routes.push({ method, parts: path.split("/").filter(Boolean), handler, hooks: [...this.hooks] });
  }
  get(path: string, handler: Handler) { this.route("GET", path, handler); }
  post(path: string, handler: Handler) { this.route("POST", path, handler); }
  put(path: string, handler: Handler) { this.route("PUT", path, handler); }
  patch(path: string, handler: Handler) { this.route("PATCH", path, handler); }
  delete(path: string, handler: Handler) { this.route("DELETE", path, handler); }
  async ready() { await Promise.all(this.registrations); }
  async dispatch(request: Request, user: AuthUser): Promise<Response> {
    await this.ready();
    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/api(?=\/)/, "").split("/").filter(Boolean);
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    try {
      const match = this.routes.find(route => route.method === request.method && route.parts.length === parts.length && route.parts.every((part, i) => part.startsWith(":") || part === parts[i]));
      if (!match) return Response.json({ code: "NOT_FOUND", message: "接口不存在" }, { status: 404, headers });
      let body: unknown;
      if (!["GET", "HEAD"].includes(request.method)) {
        if (!request.headers.get("content-type")?.includes("application/json") && request.body) return Response.json({ message: "请使用 JSON 请求" }, { status: 415, headers });
        const raw = await request.text();
        if (raw.length > 1024 * 1024) return Response.json({ message: "请求内容过大" }, { status: 413, headers });
        try { body = raw ? JSON.parse(raw) : {}; } catch { return Response.json({ message: "无效 JSON" }, { status: 400, headers }); }
      }
      const params: Record<string, string> = {};
      match.parts.forEach((part, i) => { if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(parts[i]); });
      const input: FastifyRequest = { body, params, query: Object.fromEntries(url.searchParams), authUser: user };
      const reply = new Reply();
      for (const hook of match.hooks) await hook(input, reply);
      return Response.json(await match.handler(input, reply), { status: reply.statusCode, headers });
    } catch (error) {
      if (error instanceof AppError) return Response.json({ code: error.code, message: error.message }, { status: error.statusCode, headers });
      console.error("Digmo request failed", error instanceof Error ? error.name : "UnknownError");
      return Response.json({ code: "INTERNAL_ERROR", message: "暂时无法读取或保存，请稍后重试。" }, { status: 503, headers });
    }
  }
}
