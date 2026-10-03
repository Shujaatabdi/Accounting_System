import { z } from "zod";
import { pageQuery } from "../../shared/http/pagination";

const amount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const paymentBody = z.object({
  supplierId: z.string().uuid(),
  branchId: z.string().uuid(),
  paymentDate: z.string(),
  cashAccountId: z.string().uuid(),
  amount,
  notes: z.string().trim().max(2000).nullish(),
  allocations: z.array(z.object({
    billId: z.string().uuid(),
    amount,
  })).max(100),
});

export const paymentListQuery = pageQuery.extend({
  search: z.string().optional(),
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
});

export const allocationBody = z.object({
  billId: z.string().uuid(),
  amount,
});

export const reasonBody = z.object({
  reason: z.string().trim().min(1).max(500),
  postingDate: z.string().optional(),
});
