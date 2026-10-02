import type { Sql } from "../../db/pool";

export type LineRow = {
  id: string;
  line_no: number;
  account_id: string;
  branch_id: string | null;
  description: string | null;
  debit: string;
  credit: string;
  account_code_snapshot: string | null;
  account_name_snapshot: string | null;
  account_code: string;
  account_name: string;
};

export async function lockLines(db: Sql, journalId: string) {
  return db.query<LineRow>(
    `SELECT jl.id, jl.line_no, jl.account_id, jl.branch_id, jl.description, jl.debit::text AS debit, jl.credit::text AS credit,
            jl.account_code_snapshot, jl.account_name_snapshot, a.code AS account_code, a.name AS account_name
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
      WHERE jl.journal_entry_id = $1
      ORDER BY jl.line_no
      FOR UPDATE OF jl`,
    [journalId],
  );
}

export async function lockPostableAccounts(db: Sql, accountIds: string[]) {
  return db.query<{ id: string; is_header: boolean; is_active: boolean; has_children: boolean }>(
    `SELECT a.id, a.is_header, a.is_active,
            EXISTS (SELECT 1 FROM accounts c WHERE c.parent_id = a.id) AS has_children
       FROM accounts a WHERE a.id = ANY($1::uuid[]) FOR SHARE`,
    [accountIds],
  );
}

export async function selectActiveBranches(db: Sql, branchIds: string[]) {
  return db.query<{ id: string; is_active: boolean }>(
    "SELECT id, is_active FROM branches WHERE id = ANY($1::uuid[])",
    [branchIds],
  );
}

export async function lockOpenPeriod(db: Sql, postingDate: string) {
  return db.query<{ id: string; status: string; year_status: string }>(
    `SELECT p.id, p.status, y.status AS year_status
       FROM fiscal_periods p
       JOIN fiscal_years y ON y.id = p.fiscal_year_id
      WHERE p.start_date <= $1::date AND p.end_date >= $1::date
      FOR UPDATE OF p, y`,
    [postingDate],
  );
}

export async function snapshotLineAccounts(db: Sql, journalId: string) {
  await db.query(
    `UPDATE journal_lines jl
        SET account_code_snapshot = a.code, account_name_snapshot = a.name
       FROM accounts a
      WHERE jl.journal_entry_id = $1 AND a.id = jl.account_id`,
    [journalId],
  );
}

export async function allowSystemPost(db: Sql) {
  await db.query("SELECT set_config('acc.allow_system_post', 'on', true)");
}

export async function markPosted(db: Sql, journalId: string, postingDate: string, periodId: string, postedBy: string) {
  await db.query(
    `UPDATE journal_entries
        SET status = 'posted', posting_date = $2, fiscal_period_id = $3, posted_at = now(), posted_by = $4
      WHERE id = $1`,
    [journalId, postingDate, periodId, postedBy],
  );
}

export async function insertReversalLine(
  db: Sql,
  values: unknown[],
) {
  await db.query(
    `INSERT INTO journal_lines (
       journal_entry_id, line_no, account_id, branch_id, description, debit, credit, account_code_snapshot, account_name_snapshot
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    values,
  );
}

export async function markReversedBy(db: Sql, originalId: string, reversalId: string) {
  await db.query("UPDATE journal_entries SET reversed_by_entry_id = $2 WHERE id = $1", [originalId, reversalId]);
}
