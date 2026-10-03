import type { Sql } from "../../db/pool";

const BRANCH_COLUMNS = "id, code, name, is_active, line1, city, region, country_code";

export async function countBranches(db: Sql, where: string, params: unknown[]) {
  return db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM branches ${where}`, params);
}

export async function selectAccessibleBranches(db: Sql, branchIds: string[] | null) {
  return db.query<{ id: string; code: string; name: string; is_active: boolean }>(
    `SELECT id, code, name, is_active
       FROM branches
      WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
      ORDER BY code`,
    [branchIds],
  );
}

export async function selectBranches(db: Sql, where: string, params: unknown[]) {
  return db.query(
    `SELECT ${BRANCH_COLUMNS} FROM branches ${where} ORDER BY code LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function insertBranch(db: Sql, values: unknown[]) {
  return db.query(
    `INSERT INTO branches (code, name, is_active, line1, city, region, country_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING ${BRANCH_COLUMNS}`,
    values,
  );
}

export async function lockBranch(db: Sql, id: string) {
  return db.query(`SELECT ${BRANCH_COLUMNS} FROM branches WHERE id = $1 FOR UPDATE`, [id]);
}

export async function saveBranch(db: Sql, id: string, values: unknown[]) {
  return db.query(
    `UPDATE branches
        SET code=$2, name=$3, is_active=$4, line1=$5, city=$6, region=$7, country_code=$8
      WHERE id=$1
      RETURNING ${BRANCH_COLUMNS}`,
    [id, ...values],
  );
}
