import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getConfig } from "../config";
import { query } from "../db/pool";
import { AppError } from "../lib/errors";
import { COMPANY_ADMIN_ROLE } from "../modules/auth/permissions";
import type { AuthUser } from "../modules/auth/types";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  must_change_password: boolean;
};

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

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new AppError(401, "UNAUTHENTICATED", "Sign in is required.");
    }
    const payload = jwt.verify(header.slice("Bearer ".length), getConfig().jwtSecret) as { sub?: string };
    if (!payload.sub) throw new AppError(401, "UNAUTHENTICATED", "Sign in is required.");
    const user = await loadAuthUser(payload.sub);
    if (!user?.isActive) throw new AppError(401, "UNAUTHENTICATED", "Sign in is required.");
    req.user = user;
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(401, "UNAUTHENTICATED", "Sign in is required."));
  }
}

export function requirePermission(code: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(new AppError(401, "UNAUTHENTICATED", "Sign in is required."));
    if (user.isCompanyAdmin || user.permissions.includes(code)) return next();
    return next(new AppError(403, "FORBIDDEN", "You do not have permission for this action."));
  };
}

export function blockUntilPasswordChanged(req: Request, _res: Response, next: NextFunction): void {
  const path = req.originalUrl.split("?")[0];
  const allowed =
    path.endsWith("/auth/change-password") || path.endsWith("/auth/me") || path.endsWith("/auth/logout");
  if (req.user?.mustChangePassword && !allowed) {
    next(new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Change the bootstrap password before continuing."));
    return;
  }
  next();
}

export function actorFrom(req: Request) {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Sign in is required.");
  return {
    actor: req.user,
    ipAddress: req.ip || null,
    requestId: req.requestId ?? null,
  };
}
