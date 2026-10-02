import jwt from "jsonwebtoken";
import { getConfig } from "../../config/env";
import { query } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { AppError } from "../../shared/errors";
import { findLoginUser, findPasswordHash, loadAuthUser, recordLogin, updatePassword } from "./auth.repository";
import { assertPassword, hashPassword, verifyPassword } from "./auth.passwords";
import type { AuthUser } from "./auth.types";

const TOKEN_SECONDS = 60 * 60 * 8;

export async function login(email: string, password: string, ipAddress: string | null, requestId: string | null) {
  const normalized = email.trim().toLowerCase();
  const row = await findLoginUser(normalized);
  const valid = row ? await verifyPassword(password, row.password_hash) : false;
  if (!row || !row.is_active || !valid) {
    await writeAudit({ query }, {
      actorUserId: row?.id ?? null,
      action: "auth.login.failure",
      entityType: "user",
      entityId: row?.id ?? null,
      summary: "Rejected sign-in",
      after: { email: normalized },
      ipAddress,
      requestId,
    });
    throw new AppError(401, "INVALID_LOGIN", "Email or password is not valid.");
  }
  await withTransaction(async (client) => {
    await recordLogin(client, row.id);
    await writeAudit(client, {
      actorUserId: row.id,
      action: "auth.login.success",
      entityType: "user",
      entityId: row.id,
      summary: "Signed in",
      ipAddress,
      requestId,
    });
  });
  const user = await loadAuthUser(row.id);
  if (!user) throw new AppError(401, "INVALID_LOGIN", "Email or password is not valid.");
  return { token: sign(user.id), user: publicUser(user) };
}

export async function changePassword(
  user: AuthUser,
  currentPassword: string,
  newPassword: string,
  ipAddress: string | null,
  requestId: string | null,
) {
  assertPassword(newPassword);
  const hash = await findPasswordHash(user.id);
  if (!hash || !(await verifyPassword(currentPassword, hash))) {
    throw new AppError(400, "INVALID_PASSWORD", "The current password is not valid.");
  }
  const nextHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
    await updatePassword(client, user.id, nextHash);
    await writeAudit(client, {
      actorUserId: user.id,
      action: "auth.password.change",
      entityType: "user",
      entityId: user.id,
      summary: "Changed password",
      ipAddress,
      requestId,
    });
  });
  return { token: sign(user.id) };
}

export async function logout(user: AuthUser, ipAddress: string | null, requestId: string | null) {
  await writeAudit({ query }, {
    actorUserId: user.id,
    action: "auth.logout",
    entityType: "user",
    entityId: user.id,
    summary: "Signed out",
    ipAddress,
    requestId,
  });
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    mustChangePassword: user.mustChangePassword,
    isCompanyAdmin: user.isCompanyAdmin,
    permissions: user.permissions,
    branchIds: user.branchIds,
  };
}

function sign(userId: string) {
  return jwt.sign({ sub: userId }, getConfig().jwtSecret, { expiresIn: TOKEN_SECONDS });
}
