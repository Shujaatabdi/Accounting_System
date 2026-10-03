import { z } from "zod";

export const purchasingSettingsBody = z.object({
  taxPricingMode: z.enum(["exclusive", "inclusive"]),
  apControlAccountId: z.string().uuid(),
  supplierAdvanceAccountId: z.string().uuid().nullish(),
  showSupplierTaxIdentifiers: z.boolean(),
});
