import { z } from "zod";
import { pageQuery } from "../../shared/http/pagination";

const amount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const returnLineBody = z.object({
  invoiceLineId: z.string().uuid().nullish(),
  productId: z.string().uuid().nullish(),
  description: z.string().trim().max(240).optional(),
  quantity: amount,
  unitPrice: amount.optional(),
  discountAmount: amount.optional(),
  taxCodeId: z.string().uuid().nullish(),
  returnAccountId: z.string().uuid().nullish(),
  disposition: z.enum(["restockable", "damaged", "non_restockable"]),
});

export const returnBody = z.object({
  customerId: z.string().uuid(),
  branchId: z.string().uuid(),
  returnDate: z.string(),
  reason: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(2000).nullish(),
  unreferenced: z.boolean(),
  lines: z.array(returnLineBody).min(1).max(200),
});

export const returnListQuery = pageQuery.extend({
  search: z.string().optional(),
  status: z.string().optional(),
  customerId: z.string().uuid().optional(),
});

export const reasonBody = z.object({
  reason: z.string().trim().min(1).max(500),
  postingDate: z.string().optional(),
});
