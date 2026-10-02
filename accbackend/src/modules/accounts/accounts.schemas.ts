import { z } from "zod";
import { pageQuery } from "../../shared/http/pagination";

export const accountBody = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  accountType: z.enum(["asset", "liability", "equity", "income", "expense"]),
  accountSubtype: z.string().trim().max(60).nullish(),
  parentId: z.string().uuid().nullish(),
  isHeader: z.boolean(),
  isControl: z.boolean(),
  isActive: z.boolean(),
  description: z.string().trim().max(500).nullish(),
});

export const accountListQuery = pageQuery.extend({
  search: z.string().optional(),
  postable: z.enum(["true", "false"]).optional(),
});
