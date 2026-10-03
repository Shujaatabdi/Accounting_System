import type { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/errors";

export function requirePermission(code: string) {
  return requireAnyPermission([code]);
}

export function requireAnyPermission(codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(new AppError(401, "UNAUTHENTICATED", "Sign in is required."));
    if (user.isCompanyAdmin || codes.some((code) => user.permissions.includes(code))) return next();
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
