import { buildApp } from "./app.js";
import { getConfig } from "./config.js";
import { createListenTextResolver } from "./infra/logging/logger.js";

async function main(): Promise<void> {
  const config = getConfig();
  const { app, scheduler } = await buildApp();

  try {
    const url = await app.listen({
      host: config.host,
      port: config.port,
      listenTextResolver: createListenTextResolver(),
    });

    scheduler.start();
    app.log.info(
      {
        healthcheck: `${url}/v1/health`,
        host: config.host,
        port: config.port,
        url,
      },
      "digmo api started",
    );
  } catch (error) {
    app.log.error({ err: error }, "failed to start digmo api");
    process.exit(1);
  }

  const shutdown = async (): Promise<void> => {
    scheduler.stop();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main();
