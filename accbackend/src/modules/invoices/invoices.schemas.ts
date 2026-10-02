import { z } from "zod";
import { pageQuery } from "../../shared/http/pagination";

const amount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const invoiceLineBody = z.object({
  productId: z.string().uuid(),
  description: z.string().trim().max(240).optional(),
  quantity: amount,
  unitId: z.string().uuid().nullish(),
  unitPrice: amount,
  discountAmount: amount.optional(),
  taxCodeId: z.string().uuid().nullish(),
});

export const invoiceBody = z.object({
  customerId: z.string().uuid(),
  branchId: z.string().uuid(),
  invoiceDate: z.string(),
  dueDate: z.string().optional(),
  paymentTermsDays: z.number().int().min(0).max(3650).optional(),
  notes: z.string().trim().max(2000).nullish(),
  lines: z.array(invoiceLineBody).min(1).max(200),
});

export const invoiceListQuery = pageQuery.extend({
  search: z.string().optional(),
  status: z.string().optional(),
  customerId: z.string().uuid().optional(),
});

export const invoicePostBody = z.object({
  postingDate: z.string().optional(),
  overrideCreditLimit: z.boolean().optional(),
});

export const reasonBody = z.object({
  reason: z.string().trim().min(1).max(500),
  postingDate: z.string().optional(),
});
