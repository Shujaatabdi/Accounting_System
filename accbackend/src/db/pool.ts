import { Pool, type PoolClient, type QueryResult, type QueryResultRow, types } from "pg";
import { getConfig } from "../config";

// Keep DATE columns as YYYY-MM-DD strings. node-pg's default Date parser
// shifts the calendar day when the value is later serialized with toISOString().
types.setTypeParser(1082, (value: string) => value);

let pool: Pool | undefined;

export type Sql = {
  query<T extends QueryResultRow = any>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
};

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getConfig().databaseUrl, max: 10 });
  }
  return pool;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

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

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
