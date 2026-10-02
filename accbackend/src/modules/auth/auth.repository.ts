import { query, type Sql } from "../../db/pool";
import { COMPANY_ADMIN_ROLE } from "./auth.permissions";
import type { AuthUser } from "./auth.types";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  must_change_password: boolean;
};

export async function findLoginUser(email: string) {
  const found = await query<{ id: string; password_hash: string; is_active: boolean }>(
    "SELECT id, password_hash, is_active FROM users WHERE lower(email) = $1",
    [email],
  );
  return found.rows[0] ?? null;
}

export async function recordLogin(db: Sql, userId: string) {
  await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);
}

export async function findPasswordHash(userId: string) {
  const found = await query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [userId]);
  return found.rows[0]?.password_hash ?? null;
}

export async function updatePassword(db: Sql, userId: string, passwordHash: string) {
  await db.query("UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1", [userId, passwordHash]);
}

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const users = await query<UserRow>(
    `SELECT id, email, display_name, is_active, must_change_password
       FROM users WHERE id = $1`,
    [userId],
  );
  const user = users.rows[0];
  if (!user) return null;
  const roles = await query<{ code: string }>(
    `SELECT r.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1`,
    [userId],
  );
  const isCompanyAdmin = roles.rows.some((role) => role.code === COMPANY_ADMIN_ROLE);
  const permissions = await query<{ code: string }>(
    `SELECT DISTINCT p.code
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1`,
    [userId],
  );
  const branches = await query<{ branch_id: string }>(
    `SELECT branch_id FROM user_branches WHERE user_id = $1 ORDER BY branch_id`,
    [userId],
  );
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    isActive: user.is_active,
    mustChangePassword: user.must_change_password,
    isCompanyAdmin,
    permissions: permissions.rows.map((row) => row.code),
    branchIds: isCompanyAdmin || branches.rows.length === 0 ? null : branches.rows.map((row) => row.branch_id),
  };
}
