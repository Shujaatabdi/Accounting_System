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

export const receivablesQuery = reportQuery.extend({
  customerId: z.string().uuid().optional(),
});

export const statementQuery = z.object({
  customerId: z.string().uuid(),
  from: isoDate,
  to: isoDate,
  branchId: z.string().uuid().optional(),
  format: z.enum(["csv"]).optional(),
});

export const payablesQuery = reportQuery.extend({
  supplierId: z.string().uuid().optional(),
});

export const supplierStatementQuery = z.object({
  supplierId: z.string().uuid(),
  from: isoDate,
  to: isoDate,
  branchId: z.string().uuid().optional(),
  format: z.enum(["csv"]).optional(),
});
