import { query, withTransaction, type Sql } from "../../db/pool";
import { writeAudit } from "../../lib/audit";
import { AppError, one } from "../../lib/errors";
import { pageResult, type Page } from "../../lib/pagination";
import { COMPANY_ADMIN_ROLE, PERMISSION_CODES } from "../auth/permissions";
import { assertPassword, hashPassword } from "../auth/passwords";
import type { AuthUser, RequestMeta } from "../auth/types";

export type UserInput = {
  email: string;
  displayName: string;
  isActive: boolean;
  password?: string;
  roleIds: string[];
  branchIds: string[];
};

export async function listUsers(page: Page, search?: string) {
  const term = search?.replace(/[%_]/g, "").trim();
  const params: unknown[] = [];
  const where = term
    ? (params.push(`%${term}%`), "WHERE email ILIKE $1 OR display_name ILIKE $1")
    : "";
  const total = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM users ${where}`, params);
  const rows = await query(
    `SELECT id, email, display_name, is_active, must_change_password, last_login_at
       FROM users ${where}
      ORDER BY email
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, page.offset],
  );
  const users = [];
  for (const row of rows.rows) {
    users.push(await hydrateUser(row));
  }
  return pageResult(users, Number(total.rows[0].count), page);
}

export async function createUser(input: UserInput, meta: RequestMeta) {
  if (!input.password) throw new AppError(400, "VALIDATION", "A password is required for a new user.");
  assertPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  return withTransaction(async (client) => {
    await assertAssignments(client, meta.actor, input.roleIds, input.branchIds);
    const row = one(
      (
        await client.query(
          `INSERT INTO users (email, password_hash, display_name, is_active, must_change_password)
           VALUES ($1,$2,$3,$4,true)
           RETURNING id, email, display_name, is_active, must_change_password, last_login_at`,
          [input.email.trim().toLowerCase(), passwordHash, input.displayName.trim(), input.isActive],
        )
      ).rows,
    );
    await replaceLinks(client, row.id as string, input.roleIds, input.branchIds);
    const user = await hydrateUser(row, client);
    await writeAudit(client, event(meta, "users.create", user.id, "Created user", null, user));
    return user;
  });
}

export async function updateUser(id: string, input: UserInput, meta: RequestMeta) {
  if (input.password) assertPassword(input.password);
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  return withTransaction(async (client) => {
    await assertAssignments(client, meta.actor, input.roleIds, input.branchIds);
    const existing = one(
      (
        await client.query(
          `SELECT id, email, display_name, is_active, must_change_password, last_login_at
             FROM users WHERE id = $1 FOR UPDATE`,
          [id],
        )
      ).rows,
      "User not found.",
    );
    const before = await hydrateUser(existing, client);
    await assertLastAdminSurvives(client, id, input);
    await client.query(
      `UPDATE users
          SET email = $2, display_name = $3, is_active = $4,
              password_hash = COALESCE($5, password_hash),
              must_change_password = CASE WHEN $5 IS NULL THEN must_change_password ELSE true END
        WHERE id = $1`,
      [id, input.email.trim().toLowerCase(), input.displayName.trim(), input.isActive, passwordHash],
    );
    await replaceLinks(client, id, input.roleIds, input.branchIds);
    const afterRow = one(
      (
        await client.query(
          `SELECT id, email, display_name, is_active, must_change_password, last_login_at FROM users WHERE id = $1`,
          [id],
        )
      ).rows,
    );
    const after = await hydrateUser(afterRow, client);
    await writeAudit(client, event(meta, "users.update", id, "Updated user", before, after));
    return after;
  });
}

async function assertAssignments(db: Sql, actor: AuthUser, roleIds: string[], branchIds: string[]) {
  const roles = await db.query<{ id: string; code: string }>(
    "SELECT id, code FROM roles WHERE id = ANY($1::uuid[])",
    [roleIds],
  );
  if (roles.rows.length !== new Set(roleIds).size) throw new AppError(400, "VALIDATION", "One or more roles do not exist.");
  if (roles.rows.some((role) => role.code === COMPANY_ADMIN_ROLE) && !actor.isCompanyAdmin) {
    throw new AppError(403, "PRIVILEGE_CEILING", "Only a company admin can assign the Company Admin role.");
  }
  const permissions = await db.query<{ code: string }>(
    `SELECT DISTINCT p.code
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ANY($1::uuid[])`,
    [roleIds],
  );
  if (!actor.isCompanyAdmin) {
    const missing = permissions.rows.filter((row) => !actor.permissions.includes(row.code));
    if (missing.length > 0) {
      throw new AppError(403, "PRIVILEGE_CEILING", "You cannot grant a permission you do not have.");
    }
  }
  if (branchIds.length === 0) return;
  const branches = await db.query("SELECT id FROM branches WHERE id = ANY($1::uuid[])", [branchIds]);
  if (branches.rows.length !== new Set(branchIds).size) {
    throw new AppError(400, "VALIDATION", "One or more branches do not exist.");
  }
}

async function assertLastAdminSurvives(db: Sql, userId: string, input: UserInput) {
  const adminRole = await db.query<{ id: string }>("SELECT id FROM roles WHERE code = $1", [COMPANY_ADMIN_ROLE]);
  const adminRoleId = adminRole.rows[0]?.id;
  if (!adminRoleId) return;
  const keepsAdmin = input.isActive && input.roleIds.includes(adminRoleId);
  if (keepsAdmin) return;
  const others = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.role_id = $1 AND u.is_active AND u.id <> $2`,
    [adminRoleId, userId],
  );
  if (others.rows[0].count === "0") {
    throw new AppError(409, "LAST_ADMIN", "This installation must keep one active Company Admin.");
  }
}

async function replaceLinks(db: Sql, userId: string, roleIds: string[], branchIds: string[]) {
  await db.query("DELETE FROM user_roles WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM user_branches WHERE user_id = $1", [userId]);
  for (const roleId of [...new Set(roleIds)]) {
    await db.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [userId, roleId]);
  }
  for (const branchId of [...new Set(branchIds)]) {
    await db.query("INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)", [userId, branchId]);
  }
}

async function hydrateUser(row: {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: Date | string | null;
}, db: Sql = { query }) {
  const roles = await db.query<{ id: string; code: string; name: string }>(
    `SELECT r.id, r.code, r.name
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1 ORDER BY r.name`,
    [row.id],
  );
  const branches = await db.query<{ id: string; code: string }>(
    `SELECT b.id, b.code FROM user_branches ub JOIN branches b ON b.id = ub.branch_id
      WHERE ub.user_id = $1 ORDER BY b.code`,
    [row.id],
  );
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    lastLoginAt: row.last_login_at instanceof Date ? row.last_login_at.toISOString() : row.last_login_at,
    roles: roles.rows,
    branchIds: branches.rows.map((branch) => branch.id),
    branches: branches.rows,
  };
}

export async function listRoles() {
  const roles = await query<{ id: string; code: string; name: string; description: string | null; is_system: boolean }>(
    "SELECT id, code, name, description, is_system FROM roles ORDER BY name",
  );
  const permissions = await query<{ role_id: string; code: string }>(
    `SELECT rp.role_id, p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id`,
  );
  return roles.rows.map((role) => ({
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.is_system,
    permissions: permissions.rows.filter((item) => item.role_id === role.id).map((item) => item.code).sort(),
  }));
}

export async function listPermissionCatalog() {
  const rows = await query<{ code: string; module: string; action: string; description: string }>(
    "SELECT code, module, action, description FROM permissions ORDER BY module, action",
  );
  return rows.rows;
}

export async function createRole(
  input: { code: string; name: string; description?: string | null; permissions: string[] },
  meta: RequestMeta,
) {
  assertKnownPermissions(input.permissions);
  assertWithinPrivilege(meta.actor, input.permissions);
  if (input.code.trim() === COMPANY_ADMIN_ROLE) {
    throw new AppError(409, "SYSTEM_ROLE", "The Company Admin role already exists.");
  }
  return withTransaction(async (client) => {
    const role = one(
      (
        await client.query(
          `INSERT INTO roles (code, name, description) VALUES ($1,$2,$3) RETURNING id, code, name, description, is_system`,
          [input.code.trim(), input.name.trim(), blank(input.description)],
        )
      ).rows,
    ) as { id: string; code: string; name: string; description: string | null; is_system: boolean };
    await replacePermissions(client, role.id, input.permissions);
    const saved = { ...mapRole(role), permissions: [...input.permissions].sort() };
    await writeAudit(client, event(meta, "roles.create", role.id, "Created role", null, saved));
    return saved;
  });
}

export async function updateRole(
  id: string,
  input: { name: string; description?: string | null; permissions: string[] },
  meta: RequestMeta,
) {
  assertKnownPermissions(input.permissions);
  assertWithinPrivilege(meta.actor, input.permissions);
  return withTransaction(async (client) => {
    const role = one(
      (await client.query("SELECT id, code, name, description, is_system FROM roles WHERE id = $1 FOR UPDATE", [id])).rows,
      "Role not found.",
    ) as { id: string; code: string; name: string; description: string | null; is_system: boolean };
    if (role.is_system || role.code === COMPANY_ADMIN_ROLE) {
      throw new AppError(409, "SYSTEM_ROLE", "The Company Admin role always has every permission.");
    }
    await client.query("UPDATE roles SET name = $2, description = $3 WHERE id = $1", [
      id,
      input.name.trim(),
      blank(input.description),
    ]);
    await replacePermissions(client, id, input.permissions);
    const saved = { ...mapRole({ ...role, name: input.name.trim(), description: blank(input.description) }), permissions: [...input.permissions].sort() };
    await writeAudit(client, event(meta, "roles.update", id, "Updated role", { code: role.code, name: role.name }, saved));
    return saved;
  });
}

function assertKnownPermissions(codes: string[]) {
  if (codes.some((code) => !PERMISSION_CODES.has(code))) {
    throw new AppError(400, "VALIDATION", "Unknown permission code.");
  }
}

function assertWithinPrivilege(actor: AuthUser, codes: string[]) {
  if (actor.isCompanyAdmin) return;
  if (codes.some((code) => !actor.permissions.includes(code))) {
    throw new AppError(403, "PRIVILEGE_CEILING", "You cannot grant a permission you do not have.");
  }
}

async function replacePermissions(db: Sql, roleId: string, codes: string[]) {
  await db.query("DELETE FROM role_permissions WHERE role_id = $1", [roleId]);
  if (codes.length === 0) return;
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, id FROM permissions WHERE code = ANY($2::text[])`,
    [roleId, [...new Set(codes)]],
  );
}

function mapRole(role: { id: string; code: string; name: string; description: string | null; is_system: boolean }) {
  return { id: role.id, code: role.code, name: role.name, description: role.description, isSystem: role.is_system };
}

function blank(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function event(meta: RequestMeta, action: string, id: string, summary: string, before: unknown, after: unknown) {
  return {
    actorUserId: meta.actor.id,
    action,
    entityType: action.startsWith("roles") ? "role" : "user",
    entityId: id,
    summary,
    before,
    after,
    ipAddress: meta.ipAddress,
    requestId: meta.requestId,
  };
}
