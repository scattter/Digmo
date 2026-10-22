import { FastifyRequest, preHandlerHookHandler } from "fastify";

export function createRateLimit(options: {
  max: number;
  key?: (request: FastifyRequest) => string;
  skip?: (request: FastifyRequest) => boolean;
  windowMs?: number;
}): preHandlerHookHandler {
  const windowMs = options.windowMs ?? 60_000;
  const entries = new Map<string, { count: number; expiresAt: number }>();
  let cleanupAt = 0;

  return async (request, reply) => {
    if (options.skip?.(request)) return;
    const now = Date.now();
    if (now >= cleanupAt) {
      for (const [key, entry] of entries) {
        if (entry.expiresAt <= now) entries.delete(key);
      }
      cleanupAt = now + windowMs;
    }
    const key = options.key?.(request) ?? request.ip;
    const current = entries.get(key);
    const entry = current && current.expiresAt > now ? current : { count: 0, expiresAt: now + windowMs };
    if (entry.count >= options.max || (!current && entries.size >= 10_000)) {
      return reply.header("Retry-After", Math.max(1, Math.ceil((entry.expiresAt - now) / 1000))).code(429).send({
        code: "RATE_LIMITED",
        message: "请求过于频繁，请稍后重试",
        requestId: request.id,
      });
    }
    entry.count += 1;
    entries.set(key, entry);
  };
}
