import { FastifyInstance } from "fastify";
import { Repository } from "../infra/repo/repository.js";

interface RegisterTaskRoutesDeps {
  repository: Repository;
}

export function registerTaskRoutes(app: FastifyInstance, deps: RegisterTaskRoutesDeps): void {
  app.get("/v1/tasks/valuation/status", async () => {
    return deps.repository.getValuationTaskStatus();
  });
}
