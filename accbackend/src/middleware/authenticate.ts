import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getConfig } from "../config/env";
import { loadAuthUser } from "../modules/auth/auth.repository";
import { AppError } from "../shared/errors";

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

export function actorFrom(req: Request) {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Sign in is required.");
  return {
    actor: req.user,
    ipAddress: req.ip || null,
    requestId: req.requestId ?? null,
  };
}
