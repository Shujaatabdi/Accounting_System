import { z } from "zod";
import { pageQuery } from "../../shared/http/pagination";

export const userBody = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(160),
  isActive: z.boolean(),
  password: z.string().min(1).max(200).optional(),
  roleIds: z.array(z.string().uuid()),
  branchIds: z.array(z.string().uuid()),
});

export const userListQuery = pageQuery.extend({ search: z.string().optional() });

export const auditListQuery = pageQuery.extend({
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(80).optional(),
});
