import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { closePool, getPool, query } from "./pool";

export async function migrate(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const applied = await query<{ version: string }>(
      "SELECT version FROM schema_migrations WHERE version = $1",
      [file],
    );
    if (applied.rows.length > 0) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

if (require.main === module) {
  migrate()
    .then(async () => {
      await closePool();
      console.log("Migrations complete.");
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await closePool();
      process.exit(1);
    });
}
