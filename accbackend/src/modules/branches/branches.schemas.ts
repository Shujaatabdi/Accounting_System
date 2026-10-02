import { z } from "zod";
import { pageQuery } from "../../shared/http/pagination";

const country = z.string().regex(/^[A-Za-z]{2}$/);

export const branchBody = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  isActive: z.boolean(),
  line1: z.string().trim().max(160).nullish(),
  city: z.string().trim().max(80).nullish(),
  region: z.string().trim().max(80).nullish(),
  countryCode: country.nullish(),
});

export const branchListQuery = pageQuery.extend({ search: z.string().optional() });
