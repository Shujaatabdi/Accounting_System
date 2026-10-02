import { z } from "zod";

export const roleCreateBody = z.object({
  code: z.string().trim().regex(/^[a-z0-9_]+$/).max(40),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullish(),
  permissions: z.array(z.string()),
});

export const roleUpdateBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullish(),
  permissions: z.array(z.string()),
});
