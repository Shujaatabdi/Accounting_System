import type { Sql } from "../../db/pool";

const USER_COLUMNS = "id, email, display_name, is_active, must_change_password, last_login_at";

export async function countUsers(db: Sql, where: string, params: unknown[]) {
  return db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM users ${where}`, params);
}

export async function selectUsers(db: Sql, where: string, params: unknown[]) {
  return db.query(
    `SELECT ${USER_COLUMNS} FROM users ${where} ORDER BY email LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function insertUser(db: Sql, values: unknown[]) {
  return db.query(
    `INSERT INTO users (email, password_hash, display_name, is_active, must_change_password)
     VALUES ($1,$2,$3,$4,true)
     RETURNING ${USER_COLUMNS}`,
    values,
  );
}

export async function lockUser(db: Sql, id: string) {
  return db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`, [id]);
}

export async function saveUser(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE users
        SET email = $2, display_name = $3, is_active = $4,
            password_hash = COALESCE($5, password_hash),
            must_change_password = CASE WHEN $5 IS NULL THEN must_change_password ELSE true END
      WHERE id = $1`,
    [id, ...values],
  );
}

export async function selectUser(db: Sql, id: string) {
  return db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
}

export async function selectRolesByIds(db: Sql, roleIds: string[]) {
  return db.query<{ id: string; code: string }>("SELECT id, code FROM roles WHERE id = ANY($1::uuid[])", [roleIds]);
}

export async function selectRolePermissions(db: Sql, roleIds: string[]) {
  return db.query<{ code: string }>(
    `SELECT DISTINCT p.code
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ANY($1::uuid[])`,
    [roleIds],
  );
}

export async function selectBranchIds(db: Sql, branchIds: string[]) {
  return db.query("SELECT id FROM branches WHERE id = ANY($1::uuid[])", [branchIds]);
}

export async function selectRoleByCode(db: Sql, code: string) {
  return db.query<{ id: string }>("SELECT id FROM roles WHERE code = $1", [code]);
}

export async function countOtherAdmins(db: Sql, roleId: string, userId: string) {
  return db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.role_id = $1 AND u.is_active AND u.id <> $2`,
    [roleId, userId],
  );
}

export async function clearUserLinks(db: Sql, userId: string) {
  await db.query("DELETE FROM user_roles WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM user_branches WHERE user_id = $1", [userId]);
}

export async function insertUserRole(db: Sql, userId: string, roleId: string) {
  await db.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [userId, roleId]);
}

export async function insertUserBranch(db: Sql, userId: string, branchId: string) {
  await db.query("INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)", [userId, branchId]);
}

export async function selectUserRoles(db: Sql, userId: string) {
  return db.query<{ id: string; code: string; name: string }>(
    `SELECT r.id, r.code, r.name
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1 ORDER BY r.name`,
    [userId],
  );
}

export async function selectUserBranches(db: Sql, userId: string) {
  return db.query<{ id: string; code: string }>(
    `SELECT b.id, b.code FROM user_branches ub JOIN branches b ON b.id = ub.branch_id
      WHERE ub.user_id = $1 ORDER BY b.code`,
    [userId],
  );
}

export async function countAudit(db: Sql, clause: string, params: unknown[]) {
  return db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM audit_log WHERE ${clause}`, params);
}

export async function selectAudit(db: Sql, clause: string, params: unknown[]) {
  return db.query(
    `SELECT id, occurred_at, actor_user_id, action, entity_type, entity_id, summary, before_data, after_data
       FROM audit_log WHERE ${clause}
      ORDER BY occurred_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}
