import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.EMBEDDED_POSTGRES_PORT || 5432);
const databaseDir = path.join(process.cwd(), ".pgdata");
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

async function main() {
  fs.mkdirSync(databaseDir, { recursive: true });
  const marker = path.join(databaseDir, "PG_VERSION");
  if (!fs.existsSync(marker)) {
    await postgres.initialise();
  }
  await postgres.start();
  try {
    await postgres.createDatabase("accounting");
    console.log("Created database accounting.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) throw error;
  }
  console.log(`Embedded PostgreSQL is listening on 127.0.0.1:${port}.`);
  console.log("Stop it with Ctrl+C. This process is for local development only.");
  const shutdown = async () => {
    await postgres.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
  await new Promise(() => undefined);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
