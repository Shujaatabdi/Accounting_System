import jwt from "jsonwebtoken";
import { getConfig } from "../../config";
import { query, withTransaction } from "../../db/pool";
import { writeAudit } from "../../lib/audit";
import { AppError } from "../../lib/errors";
import { loadAuthUser } from "../../middleware/auth";
import { assertPassword, hashPassword, verifyPassword } from "./passwords";
import type { AuthUser } from "./types";

const TOKEN_SECONDS = 60 * 60 * 8;

export async function login(email: string, password: string, ipAddress: string | null, requestId: string | null) {
  const normalized = email.trim().toLowerCase();
  const found = await query<{ id: string; password_hash: string; is_active: boolean }>(
    "SELECT id, password_hash, is_active FROM users WHERE lower(email) = $1",
    [normalized],
  );
  const row = found.rows[0];
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
    await client.query("UPDATE users SET last_login_at = now() WHERE id = $1", [row.id]);
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
  const found = await query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [user.id]);
  const hash = found.rows[0]?.password_hash;
  if (!hash || !(await verifyPassword(currentPassword, hash))) {
    throw new AppError(400, "INVALID_PASSWORD", "The current password is not valid.");
  }
  const nextHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
    await client.query("UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1", [user.id, nextHash]);
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
