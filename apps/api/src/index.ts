import { buildApp } from "./app";
import { getConfig } from "./config";

async function main(): Promise<void> {
  const config = getConfig();
  const { app, scheduler } = await buildApp();

  try {
    await app.listen({
      host: config.host,
      port: config.port
    });

    scheduler.start();
    app.log.info({ host: config.host, port: config.port }, "digmo api started");
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
