import { query } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { AppError, one } from "../../shared/errors";
import { COMPANY_ADMIN_ROLE, PERMISSION_CODES } from "../auth/auth.permissions";
import { unknownPermissionMessage } from "./roles.schemas";
import type { AuthUser, RequestMeta } from "../auth/auth.types";
import {
  insertRole,
  lockRole,
  replaceRolePermissions,
  saveRole,
  selectAllRolePermissions,
  selectPermissionCatalog,
  selectRoles,
} from "./roles.repository";

export async function listRoles() {
  const roles = await selectRoles({ query });
  const permissions = await selectAllRolePermissions({ query });
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
  const rows = await selectPermissionCatalog({ query });
  return rows.rows;
}

export async function createRole(
  input: { code: string; name: string; description?: string | null; permissions: string[] },
  meta: RequestMeta,
) {
  const permissions = uniquePermissions(input.permissions);
  assertKnownPermissions(permissions);
  assertWithinPrivilege(meta.actor, permissions);
  if (input.code.trim() === COMPANY_ADMIN_ROLE) {
    throw new AppError(409, "SYSTEM_ROLE", "The Company Admin role already exists.");
  }
  return withTransaction(async (client) => {
    const role = one((await insertRole(client, input.code.trim(), input.name.trim(), blank(input.description))).rows) as {
      id: string;
      code: string;
      name: string;
      description: string | null;
      is_system: boolean;
    };
    const stored = await replaceRolePermissions(client, role.id, permissions);
    assertStoredPermissions(permissions, stored);
    const saved = { ...mapRole(role), permissions: stored.sort() };
    await writeAudit(client, event(meta, "roles.create", role.id, "Created role", null, saved));
    return saved;
  });
}

export async function updateRole(
  id: string,
  input: { name: string; description?: string | null; permissions: string[] },
  meta: RequestMeta,
) {
  const permissions = uniquePermissions(input.permissions);
  assertKnownPermissions(permissions);
  assertWithinPrivilege(meta.actor, permissions);
  return withTransaction(async (client) => {
    const role = one((await lockRole(client, id)).rows, "Role not found.") as {
      id: string;
      code: string;
      name: string;
      description: string | null;
      is_system: boolean;
    };
    if (role.is_system || role.code === COMPANY_ADMIN_ROLE) {
      throw new AppError(409, "SYSTEM_ROLE", "The Company Admin role always has every permission.");
    }
    const description = blank(input.description);
    await saveRole(client, id, input.name.trim(), description);
    const stored = await replaceRolePermissions(client, id, permissions);
    assertStoredPermissions(permissions, stored);
    const saved = { ...mapRole({ ...role, name: input.name.trim(), description }), permissions: stored.sort() };
    await writeAudit(client, event(meta, "roles.update", id, "Updated role", { code: role.code, name: role.name }, saved));
    return saved;
  });
}

function uniquePermissions(codes: string[]) {
  return [...new Set(codes)];
}

function assertKnownPermissions(codes: string[]) {
  const unknown = codes.filter((code) => !PERMISSION_CODES.has(code));
  if (unknown.length > 0) {
    throw new AppError(400, "VALIDATION", unknownPermissionMessage(unknown), { permissions: unknown });
  }
}

function assertStoredPermissions(requested: string[], stored: string[]) {
  const saved = new Set(stored);
  const missing = requested.filter((code) => !saved.has(code));
  if (missing.length > 0) {
    throw new AppError(400, "VALIDATION", unknownPermissionMessage(missing), { permissions: missing });
  }
}

function assertWithinPrivilege(actor: AuthUser, codes: string[]) {
  if (actor.isCompanyAdmin) return;
  const denied = codes.filter((code) => !actor.permissions.includes(code));
  if (denied.length > 0) {
    const listed = denied.join(", ");
    throw new AppError(403, "PRIVILEGE_CEILING", `You cannot grant ${listed}.`, { permissions: denied });
  }
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
    entityType: "role",
    entityId: id,
    summary,
    before,
    after,
    ipAddress: meta.ipAddress,
    requestId: meta.requestId,
  };
}
