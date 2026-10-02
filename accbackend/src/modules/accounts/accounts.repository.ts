import type { Sql } from "../../db/pool";

export function accountColumns() {
  return `a.id, a.code, a.name, a.account_type, a.account_subtype, a.parent_id, parent.code AS parent_code,
          a.is_header, a.is_control, a.is_active, a.is_system, a.normal_balance, a.description`;
}

export function accountSelect() {
  return `SELECT ${accountColumns()} FROM accounts a LEFT JOIN accounts parent ON parent.id = a.parent_id`;
}

function accountReturning() {
  return `id, code, name, account_type, account_subtype, parent_id,
          (SELECT code FROM accounts parent WHERE parent.id = accounts.parent_id) AS parent_code,
          is_header, is_control, is_active, is_system, normal_balance, description`;
}

export async function countAccounts(db: Sql, where: string, params: unknown[]) {
  return db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM accounts a WHERE ${where}`, params);
}

export async function selectAccounts(db: Sql, where: string, params: unknown[]) {
  return db.query(`${accountSelect()} WHERE ${where} ORDER BY a.code LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
}

export async function insertAccount(db: Sql, values: unknown[]) {
  return db.query(
    `INSERT INTO accounts (
       code, name, account_type, account_subtype, parent_id, is_header, is_control, is_active, normal_balance, description
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${accountReturning()}`,
    values,
  );
}

export async function lockAccount(db: Sql, id: string) {
  return db.query(
    `SELECT ${accountColumns()},
            (SELECT COUNT(*)::text FROM journal_lines jl WHERE jl.account_id = a.id) AS line_count
       FROM accounts a
       LEFT JOIN accounts parent ON parent.id = a.parent_id
      WHERE a.id = $1
      FOR UPDATE OF a`,
    [id],
  );
}

export async function childExists(db: Sql, id: string) {
  return db.query("SELECT 1 FROM accounts WHERE parent_id = $1 LIMIT 1", [id]);
}

export async function saveAccount(db: Sql, id: string, values: unknown[]) {
  return db.query(
    `UPDATE accounts SET
       code=$2, name=$3, account_type=$4, account_subtype=$5, parent_id=$6,
       is_header=$7, is_control=$8, is_active=$9, normal_balance=$10, description=$11
     WHERE id=$1
     RETURNING ${accountReturning()}`,
    [id, ...values],
  );
}

export async function lockAccountHeader(db: Sql, id: string) {
  return db.query(`${accountSelect()} WHERE a.id = $1 FOR UPDATE OF a`, [id]);
}

export async function lineExists(db: Sql, accountId: string) {
  return db.query("SELECT 1 FROM journal_lines WHERE account_id = $1 LIMIT 1", [accountId]);
}

export async function deleteAccountRow(db: Sql, id: string) {
  await db.query("DELETE FROM accounts WHERE id = $1", [id]);
}

export async function findAccount(db: Sql, id: string) {
  return db.query(`${accountSelect()} WHERE a.id = $1`, [id]);
}

export async function selectParentId(db: Sql, id: string) {
  return db.query<{ parent_id: string | null }>("SELECT parent_id FROM accounts WHERE id = $1", [id]);
}
