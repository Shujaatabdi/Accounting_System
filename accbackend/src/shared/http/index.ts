import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../errors";

export function wrap(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, "VALIDATION", "Request validation failed.", flatten(result.error));
  }
  return result.data;
}

export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
  return parseBody(schema, query);
}

function flatten(error: ZodError): unknown {
  return error.flatten();
}

export function clientIp(req: Request): string | null {
  return req.ip || null;
}
