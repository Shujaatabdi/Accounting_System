import type { Sql } from "../../db/pool";

export async function selectRoles(db: Sql) {
  return db.query<{ id: string; code: string; name: string; description: string | null; is_system: boolean }>(
    "SELECT id, code, name, description, is_system FROM roles ORDER BY name",
  );
}

export async function selectAllRolePermissions(db: Sql) {
  return db.query<{ role_id: string; code: string }>(
    `SELECT rp.role_id, p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id`,
  );
}

export async function selectPermissionCatalog(db: Sql) {
  return db.query<{ code: string; module: string; action: string; description: string }>(
    "SELECT code, module, action, description FROM permissions ORDER BY module, action",
  );
}

export async function insertRole(db: Sql, code: string, name: string, description: string | null) {
  return db.query(
    `INSERT INTO roles (code, name, description) VALUES ($1,$2,$3) RETURNING id, code, name, description, is_system`,
    [code, name, description],
  );
}

export async function lockRole(db: Sql, id: string) {
  return db.query("SELECT id, code, name, description, is_system FROM roles WHERE id = $1 FOR UPDATE", [id]);
}

export async function saveRole(db: Sql, id: string, name: string, description: string | null) {
  await db.query("UPDATE roles SET name = $2, description = $3 WHERE id = $1", [id, name, description]);
}

export async function replaceRolePermissions(db: Sql, roleId: string, codes: string[]) {
  await db.query("DELETE FROM role_permissions WHERE role_id = $1", [roleId]);
  if (codes.length === 0) return;
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, id FROM permissions WHERE code = ANY($2::text[])`,
    [roleId, [...new Set(codes)]],
  );
}
