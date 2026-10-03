import { query } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { AppError, one } from "../../shared/errors";
import type { RequestMeta } from "../auth/auth.types";
import { selectPostableAccount, selectSalesSettings, updateSalesSettings } from "./sales.repository";

export async function getSalesSettings() {
  return map(one((await selectSalesSettings({ query })).rows, "Sales settings are not configured."));
}

export async function updateSalesSettingsProfile(
  input: {
    taxPricingMode: "exclusive" | "inclusive";
    unappliedReceiptTreatment: "customer_advance" | "credit_ar";
    arControlAccountId: string;
    customerAdvanceAccountId?: string | null;
    showCustomerTaxIdentifiers: boolean;
  },
  meta: RequestMeta,
) {
  return withTransaction(async (client) => {
    const before = map(one((await selectSalesSettings(client)).rows));
    await assertAccount(client, input.arControlAccountId, "asset", "The receivable control account must be an active asset account.");
    if (input.customerAdvanceAccountId) {
      await assertAccount(client, input.customerAdvanceAccountId, "liability", "The customer advance account must be an active liability account.");
    }
    if (input.unappliedReceiptTreatment === "customer_advance" && !input.customerAdvanceAccountId) {
      throw new AppError(400, "VALIDATION", "Choose a customer advance liability account before using that receipt treatment.");
    }
    await updateSalesSettings(client, [
      input.taxPricingMode,
      input.unappliedReceiptTreatment,
      input.arControlAccountId,
      input.customerAdvanceAccountId ?? null,
      input.showCustomerTaxIdentifiers,
    ]);
    const saved = map(one((await selectSalesSettings(client)).rows));
    await writeAudit(client, {
      actorUserId: meta.actor.id,
      action: "sales_settings.update",
      entityType: "sales_settings",
      entityId: "1",
      summary: "Updated sales settings",
      before,
      after: saved,
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
    });
    return saved;
  });
}

async function assertAccount(db: { query: typeof query }, id: string, type: string, message: string) {
  const account = one((await selectPostableAccount(db, id)).rows, "Account not found.");
  if (!account.is_active || account.is_header || account.account_type !== type) throw new AppError(400, "VALIDATION", message);
}

function map(row: Awaited<ReturnType<typeof selectSalesSettings>>["rows"][number]) {
  return {
    taxPricingMode: row.tax_pricing_mode,
    discountTreatment: row.discount_treatment,
    unappliedReceiptTreatment: row.unapplied_receipt_treatment,
    arControlAccountId: row.ar_control_account_id,
    customerAdvanceAccountId: row.customer_advance_account_id,
    showCustomerTaxIdentifiers: row.show_customer_tax_identifiers,
  };
}
