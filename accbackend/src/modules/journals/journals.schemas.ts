import { z } from "zod";
import { pageQuery } from "../../shared/http/pagination";

const amount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "Amount must be a decimal string");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const journalBody = z.object({
  entryDate: isoDate,
  description: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(80).nullish(),
  sourceType: z.enum(["manual", "opening_balance"]).default("manual"),
  lines: z.array(z.object({
    accountId: z.string().uuid(),
    branchId: z.string().uuid().nullish(),
    description: z.string().trim().max(300).nullish(),
    debit: amount,
    credit: amount,
  })).min(1).max(200),
});

export const journalListQuery = pageQuery.extend({
  status: z.enum(["draft", "pending_approval", "approved", "posted", "void"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  search: z.string().optional(),
});

export const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });
export const postBody = z.object({ postingDate: isoDate.optional() });
export const reverseBody = reasonBody.extend({ postingDate: isoDate.optional() });
