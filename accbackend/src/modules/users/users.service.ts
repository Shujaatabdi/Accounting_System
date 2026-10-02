import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { AppError, one } from "../../shared/errors";
import { pageResult, type Page } from "../../shared/http/pagination";
import { COMPANY_ADMIN_ROLE } from "../auth/auth.permissions";
import { assertPassword, hashPassword } from "../auth/auth.passwords";
import type { AuthUser, RequestMeta } from "../auth/auth.types";
import type { UserInput } from "./users.types";
import {
  clearUserLinks,
  countAudit,
  countOtherAdmins,
  countUsers,
  insertUser,
  insertUserBranch,
  insertUserRole,
  lockUser,
  saveUser,
  selectAudit,
  selectBranchIds,
  selectRoleByCode,
  selectRolePermissions,
  selectRolesByIds,
  selectUser,
  selectUserBranches,
  selectUserRoles,
  selectUsers,
} from "./users.repository";

export async function listUsers(page: Page, search?: string) {
  const term = search?.replace(/[%_]/g, "").trim();
  const params: unknown[] = [];
  const where = term ? (params.push(`%${term}%`), "WHERE email ILIKE $1 OR display_name ILIKE $1") : "";
  const total = await countUsers({ query }, where, params);
  const rows = await selectUsers({ query }, where, [...params, page.pageSize, page.offset]);
  const users = [];
  for (const row of rows.rows) users.push(await hydrateUser(row));
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
        await insertUser(client, [
          input.email.trim().toLowerCase(),
          passwordHash,
          input.displayName.trim(),
          input.isActive,
        ])
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
    const existing = one((await lockUser(client, id)).rows, "User not found.");
    const before = await hydrateUser(existing, client);
    await assertLastAdminSurvives(client, id, input);
    await saveUser(client, id, [
      input.email.trim().toLowerCase(),
      input.displayName.trim(),
      input.isActive,
      passwordHash,
    ]);
    await replaceLinks(client, id, input.roleIds, input.branchIds);
    const after = await hydrateUser(one((await selectUser(client, id)).rows), client);
    await writeAudit(client, event(meta, "users.update", id, "Updated user", before, after));
    return after;
  });
}

export async function listAudit(page: Page, filters: { entityType?: string; entityId?: string }) {
  const params: unknown[] = [];
  const where = ["TRUE"];
  if (filters.entityType) {
    params.push(filters.entityType);
    where.push(`entity_type = $${params.length}`);
  }
  if (filters.entityId) {
    params.push(filters.entityId);
    where.push(`entity_id = $${params.length}`);
  }
  const clause = where.join(" AND ");
  const total = await countAudit({ query }, clause, params);
  const rows = await selectAudit({ query }, clause, [...params, page.pageSize, page.offset]);
  return {
    data: rows.rows.map((row) => ({
      id: row.id as string,
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
      actorUserId: row.actor_user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      summary: row.summary,
      before: row.before_data,
      after: row.after_data,
    })),
    page: page.page,
    pageSize: page.pageSize,
    total: Number(total.rows[0].count),
  };
}

async function assertAssignments(db: Sql, actor: AuthUser, roleIds: string[], branchIds: string[]) {
  const roles = await selectRolesByIds(db, roleIds);
  if (roles.rows.length !== new Set(roleIds).size) throw new AppError(400, "VALIDATION", "One or more roles do not exist.");
  if (roles.rows.some((role) => role.code === COMPANY_ADMIN_ROLE) && !actor.isCompanyAdmin) {
    throw new AppError(403, "PRIVILEGE_CEILING", "Only a company admin can assign the Company Admin role.");
  }
  const permissions = await selectRolePermissions(db, roleIds);
  if (!actor.isCompanyAdmin) {
    const missing = permissions.rows.filter((row) => !actor.permissions.includes(row.code));
    if (missing.length > 0) {
      throw new AppError(403, "PRIVILEGE_CEILING", "You cannot grant a permission you do not have.");
    }
  }
  if (branchIds.length === 0) return;
  const branches = await selectBranchIds(db, branchIds);
  if (branches.rows.length !== new Set(branchIds).size) {
    throw new AppError(400, "VALIDATION", "One or more branches do not exist.");
  }
}

async function assertLastAdminSurvives(db: Sql, userId: string, input: UserInput) {
  const adminRole = await selectRoleByCode(db, COMPANY_ADMIN_ROLE);
  const adminRoleId = adminRole.rows[0]?.id;
  if (!adminRoleId) return;
  if (input.isActive && input.roleIds.includes(adminRoleId)) return;
  const others = await countOtherAdmins(db, adminRoleId, userId);
  if (others.rows[0].count === "0") {
    throw new AppError(409, "LAST_ADMIN", "This installation must keep one active Company Admin.");
  }
}

async function replaceLinks(db: Sql, userId: string, roleIds: string[], branchIds: string[]) {
  await clearUserLinks(db, userId);
  for (const roleId of [...new Set(roleIds)]) await insertUserRole(db, userId, roleId);
  for (const branchId of [...new Set(branchIds)]) await insertUserBranch(db, userId, branchId);
}

async function hydrateUser(
  row: {
    id: string;
    email: string;
    display_name: string;
    is_active: boolean;
    must_change_password: boolean;
    last_login_at: Date | string | null;
  },
  db: Sql = { query },
) {
  const roles = await selectUserRoles(db, row.id);
  const branches = await selectUserBranches(db, row.id);
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

function event(meta: RequestMeta, action: string, id: string, summary: string, before: unknown, after: unknown) {
  return {
    actorUserId: meta.actor.id,
    action,
    entityType: "user",
    entityId: id,
    summary,
    before,
    after,
    ipAddress: meta.ipAddress,
    requestId: meta.requestId,
  };
}
