import "dotenv/config";
import { createApp } from "./app";
import { getConfig } from "./config";
import { closePool } from "./db/pool";

const app = createApp();
const server = app.listen(getConfig().port, () => {
  console.log(`Accounting API listening on port ${getConfig().port}`);
});

async function shutdown() {
  server.close();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
