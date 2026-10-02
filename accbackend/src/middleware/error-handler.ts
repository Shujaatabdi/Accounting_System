import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";
import { AppError } from "../shared/errors";

type PgError = { code?: string; message?: string };

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const mapped = mapError(error);
  if (!(mapped instanceof AppError)) {
    logger.error(error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong." } });
    return;
  }
  const body: { error: { code: string; message: string; details?: unknown } } = {
    error: { code: mapped.code, message: mapped.message },
  };
  if (mapped.details !== undefined) body.error.details = mapped.details;
  res.status(mapped.status).json(body);
}

function mapError(error: unknown): unknown {
  if (!error || typeof error !== "object" || !("code" in error)) return error;
  const pg = error as PgError;
  if (pg.code === "23505") return new AppError(409, "CONFLICT", "That value is already in use.");
  if (pg.code === "23503") return new AppError(409, "IN_USE", "The record is still referenced.");
  if (pg.code === "23514") return new AppError(400, "CHECK_FAILED", "The database rejected the values.");
  if (pg.code === "23P01") return new AppError(409, "OVERLAP", "Those dates overlap an existing fiscal year or period.");
  if (pg.code === "P0001") return new AppError(409, "DB_RULE", pg.message || "The database rejected the change.");
  return error;
}
