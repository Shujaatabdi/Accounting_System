import { z } from "zod";
import { pageQuery } from "../../shared/http/pagination";

const amount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const factor = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const categoryBody = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  isActive: z.boolean(),
});

export const unitBody = z.object({
  code: z.string().trim().min(1).max(16),
  name: z.string().trim().min(1).max(80),
});

export const productBody = z.object({
  sku: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).nullish(),
  itemType: z.enum(["stock", "non_stock", "service"]),
  categoryId: z.string().uuid().nullish(),
  salesPrice: amount,
  taxCodeId: z.string().uuid().nullish(),
  baseUnitId: z.string().uuid().nullish(),
  salesAccountId: z.string().uuid(),
  returnAccountId: z.string().uuid(),
  purchaseAccountId: z.string().uuid().nullish(),
  isActive: z.boolean(),
  notes: z.string().trim().max(2000).nullish(),
  units: z.array(z.object({
    unitId: z.string().uuid(),
    factor,
    isBase: z.boolean(),
  })).max(12),
});

export const productListQuery = pageQuery.extend({
  search: z.string().optional(),
  active: z.enum(["true", "false"]).optional(),
});

export const productSuppliersBody = z.object({
  suppliers: z.array(z.object({
    supplierId: z.string().uuid(),
    supplierItemCode: z.string().trim().max(60).nullish(),
    purchasePrice: amount,
    leadTimeDays: z.number().int().min(0).max(3650),
    isPreferred: z.boolean(),
  })).max(50),
});
