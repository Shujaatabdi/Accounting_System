import { z } from "zod";

export const salesSettingsBody = z.object({
  taxPricingMode: z.enum(["exclusive", "inclusive"]),
  unappliedReceiptTreatment: z.enum(["customer_advance", "credit_ar"]),
  arControlAccountId: z.string().uuid(),
  customerAdvanceAccountId: z.string().uuid().nullish(),
});
