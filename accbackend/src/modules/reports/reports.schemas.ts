import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reportQuery = z.object({
  asOf: isoDate.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  branchId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  format: z.enum(["csv"]).optional(),
});
