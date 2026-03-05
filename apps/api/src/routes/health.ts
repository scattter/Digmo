import { ASIA_SHANGHAI_TIMEZONE, HealthResponse } from "@digmo/shared";
import { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/v1/health", async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      timezone: ASIA_SHANGHAI_TIMEZONE
    };
  });
}
