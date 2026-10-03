import { z } from "zod";
import { pageQuery } from "../../shared/http/pagination";

const amount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const billLineBody = z.object({
  productId: z.string().uuid(),
  description: z.string().trim().max(240).optional(),
  quantity: amount,
  unitId: z.string().uuid().nullish(),
  unitPrice: amount,
  discountAmount: amount.optional(),
  taxCodeId: z.string().uuid().nullish(),
});

export const billBody = z.object({
  supplierId: z.string().uuid(),
  branchId: z.string().uuid(),
  billDate: z.string(),
  dueDate: z.string().optional(),
  paymentTermsDays: z.number().int().min(0).max(3650).optional(),
  notes: z.string().trim().max(2000).nullish(),
  lines: z.array(billLineBody).min(1).max(200),
});

export const billListQuery = pageQuery.extend({
  search: z.string().optional(),
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
});

export const billPostBody = z.object({
  postingDate: z.string().optional(),
});

export const reasonBody = z.object({
  reason: z.string().trim().min(1).max(500),
  postingDate: z.string().optional(),
});
