import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyServerOptions } from "fastify";

type LoggerOptions = Exclude<FastifyServerOptions["logger"], boolean | undefined>;

function isDevelopmentRuntime(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production";
}

function resolvePrettyTransportTarget(): string {
  const tsPath = fileURLToPath(new URL("./dev-pretty-transport.ts", import.meta.url));
  if (existsSync(tsPath)) {
    return tsPath;
  }

  return fileURLToPath(new URL("./dev-pretty-transport.js", import.meta.url));
}

export function createListenTextResolver(
  nodeEnv = process.env.NODE_ENV,
): (address: string) => string {
  if (!isDevelopmentRuntime(nodeEnv)) {
    return (address) => `Server listening at ${address}`;
  }

  return (address) => `Listening on ${address}`;
}

export function createLoggerOptions(
  nodeEnv = process.env.NODE_ENV,
): LoggerOptions {
  const baseOptions: LoggerOptions = {
    level: "info",
  };

  if (!isDevelopmentRuntime(nodeEnv)) {
    return baseOptions;
  }

  return {
    ...baseOptions,
    transport: {
      target: resolvePrettyTransportTarget(),
      options: {
        colorize: true,
        errorLikeObjectKeys: ["err", "error"],
        ignore: "pid,hostname",
        translateTime: "HH:MM:ss.l",
      },
    },
  };
}
