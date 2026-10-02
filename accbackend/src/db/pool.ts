import { Pool, type QueryResult, type QueryResultRow, types } from "pg";
import { getConfig } from "../config/env";

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

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
