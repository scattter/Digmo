import { createClient } from "redis";
import { AppConfig } from "../../config.js";
import { ShareCache } from "./service.js";

interface LoggerLike {
  warn: (payload: unknown, message?: string) => void;
}

interface ShareCachePayload {
  id: string;
  userId: string;
  portfolioId: string;
  shareCode: string;
  status: "ACTIVE" | "INACTIVE";
  snapshotJson: string;
  passwordHash?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

function toTtlSeconds(expiresAt?: string): number | undefined {
  if (!expiresAt) {
    return undefined;
  }
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) {
    return undefined;
  }
  const ttlSeconds = Math.floor((expiresMs - Date.now()) / 1000);
  return ttlSeconds > 0 ? ttlSeconds : 1;
}

export class RedisShareCache implements ShareCache {
  private readonly client: ReturnType<typeof createClient>;
  private readonly keyPrefix: string;
  private readonly logger: LoggerLike;

  constructor(input: {
    client: ReturnType<typeof createClient>;
    keyPrefix: string;
    logger: LoggerLike;
  }) {
    this.client = input.client;
    this.keyPrefix = input.keyPrefix;
    this.logger = input.logger;
  }

  private key(shareCode: string): string {
    return `${this.keyPrefix}${shareCode}`;
  }

  async get(shareCode: string): Promise<ShareCachePayload | undefined> {
    const raw = await this.client.get(this.key(shareCode));
    if (!raw) {
      return undefined;
    }
    try {
      return JSON.parse(raw) as ShareCachePayload;
    } catch (error) {
      this.logger.warn({ err: error, shareCode }, "invalid share cache payload");
      await this.delete(shareCode);
      return undefined;
    }
  }

  async set(record: ShareCachePayload): Promise<void> {
    const key = this.key(record.shareCode);
    const value = JSON.stringify(record);
    const ttlSeconds = toTtlSeconds(record.expiresAt);
    if (ttlSeconds) {
      await this.client.set(key, value, { EX: ttlSeconds });
      return;
    }
    await this.client.set(key, value);
  }

  async delete(shareCode: string): Promise<void> {
    await this.client.del(this.key(shareCode));
  }
}

export async function createShareCache(
  config: AppConfig["redis"],
  logger: LoggerLike,
): Promise<ShareCache | undefined> {
  if (!config.enabled || !config.url) {
    return undefined;
  }

  const client = createClient({
    url: config.url,
    socket: {
      connectTimeout: config.connectTimeoutMs,
      reconnectStrategy: false,
    },
  });

  client.on("error", (error) => {
    logger.warn({ err: error }, "redis share cache runtime error");
  });

  try {
    await client.connect();
    return new RedisShareCache({
      client,
      keyPrefix: config.keyPrefix,
      logger,
    });
  } catch (error) {
    logger.warn({ err: error }, "redis share cache unavailable, fallback to sqlite");
    try {
      await client.disconnect();
    } catch {
      // ignore cleanup failure
    }
    return undefined;
  }
}
