import type { PoolClient } from "pg";
import { getPool } from "./pool";

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The original error is the one that matters.
    }
    throw error;
  } finally {
    client.release();
  }
}
