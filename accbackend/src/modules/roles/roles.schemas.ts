import { z } from "zod";
import { PERMISSION_CODES } from "../auth/auth.permissions";

export const ROLE_CODE_PATTERN = /^[A-Za-z0-9_]{1,40}$/;
export const ROLE_CODE_MESSAGE = "Role code can use letters, digits, and underscores only, up to 40 characters.";

const roleCode = z.string().trim().min(1).max(40).regex(ROLE_CODE_PATTERN, ROLE_CODE_MESSAGE);

export function unknownPermissionMessage(codes: string[]) {
  const unknown = [...new Set(codes)];
  if (unknown.length === 1) return `Unknown permission: ${unknown[0]}.`;
  return `Unknown permissions: ${unknown.join(", ")}.`;
}

const permissions = z.array(z.string()).superRefine((codes, ctx) => {
  const unknown = [...new Set(codes.filter((code) => !PERMISSION_CODES.has(code)))];
  if (unknown.length > 0) {
    ctx.addIssue({ code: "custom", message: unknownPermissionMessage(unknown) });
  }
});

export const roleCreateBody = z.object({
  code: roleCode,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullish(),
  permissions,
});

export const roleUpdateBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullish(),
  permissions,
});
