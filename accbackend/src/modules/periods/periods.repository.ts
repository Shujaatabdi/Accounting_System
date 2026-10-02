import type { Sql } from "../../db/pool";

export async function listYears(db: Sql) {
  return db.query(`SELECT id, name, start_date, end_date, status FROM fiscal_years ORDER BY start_date`);
}

export async function listPeriods(db: Sql) {
  return db.query(
    `SELECT id, fiscal_year_id, period_no, name, start_date, end_date, status
       FROM fiscal_periods ORDER BY start_date`,
  );
}

export async function insertYear(db: Sql, name: string, startDate: string, endDate: string) {
  return db.query(
    `INSERT INTO fiscal_years (name, start_date, end_date, status)
     VALUES ($1, $2, $3, 'open') RETURNING id, name, start_date, end_date, status`,
    [name, startDate, endDate],
  );
}

export async function insertPeriod(db: Sql, yearId: string, period: { periodNo: number; name: string; startDate: string; endDate: string }) {
  await db.query(
    `INSERT INTO fiscal_periods (fiscal_year_id, period_no, name, start_date, end_date, status)
     VALUES ($1,$2,$3,$4,$5,'open')`,
    [yearId, period.periodNo, period.name, period.startDate, period.endDate],
  );
}

export async function lockPeriod(db: Sql, id: string) {
  return db.query(
    `SELECT p.id, p.status, p.name, y.id AS year_id, y.status AS year_status
       FROM fiscal_periods p
       JOIN fiscal_years y ON y.id = p.fiscal_year_id
      WHERE p.id = $1
      FOR UPDATE OF p, y`,
    [id],
  );
}

export async function setPeriodStatus(db: Sql, id: string, status: string) {
  await db.query("UPDATE fiscal_periods SET status = $2 WHERE id = $1", [id, status]);
}

export async function countUnpostedInPeriod(db: Sql, id: string) {
  return db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM journal_entries je
       JOIN fiscal_periods p ON je.entry_date BETWEEN p.start_date AND p.end_date
      WHERE p.id = $1 AND je.status IN ('draft', 'pending_approval', 'approved')`,
    [id],
  );
}

export async function lockYear(db: Sql, id: string) {
  return db.query("SELECT id, name, status FROM fiscal_years WHERE id = $1 FOR UPDATE", [id]);
}

export async function setYearStatus(db: Sql, id: string, status: string) {
  await db.query("UPDATE fiscal_years SET status = $2 WHERE id = $1", [id, status]);
}

export async function closeYearPeriods(db: Sql, yearId: string) {
  await db.query("UPDATE fiscal_periods SET status = 'closed' WHERE fiscal_year_id = $1", [yearId]);
}
