import { query } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { AppError, one } from "../../shared/errors";
import type { RequestMeta } from "../auth/auth.types";
import { selectPostableAccount } from "./sales.repository";
import { selectPurchasingSettings, updatePurchasingSettings } from "./purchasing.repository";

export async function getPurchasingSettings() {
  return map(one((await selectPurchasingSettings({ query })).rows, "Purchasing settings are not configured."));
}

export async function updatePurchasingSettingsProfile(
  input: {
    taxPricingMode: "exclusive" | "inclusive";
    apControlAccountId: string;
    supplierAdvanceAccountId?: string | null;
    showSupplierTaxIdentifiers: boolean;
  },
  meta: RequestMeta,
) {
  return withTransaction(async (client) => {
    const before = map(one((await selectPurchasingSettings(client)).rows));
    await assertAccount(client, input.apControlAccountId, "liability", "The payable control account must be an active liability account.");
    if (input.supplierAdvanceAccountId) {
      await assertAccount(client, input.supplierAdvanceAccountId, "asset", "The supplier advance account must be an active asset account.");
      if (input.supplierAdvanceAccountId === input.apControlAccountId) {
        throw new AppError(400, "VALIDATION", "The supplier advance account cannot be the payable control account.");
      }
    }
    await updatePurchasingSettings(client, [
      input.taxPricingMode,
      input.apControlAccountId,
      input.supplierAdvanceAccountId ?? null,
      input.showSupplierTaxIdentifiers,
    ]);
    const saved = map(one((await selectPurchasingSettings(client)).rows));
    await writeAudit(client, {
      actorUserId: meta.actor.id,
      action: "purchasing_settings.update",
      entityType: "purchasing_settings",
      entityId: "1",
      summary: "Updated purchasing settings",
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

function map(row: Awaited<ReturnType<typeof selectPurchasingSettings>>["rows"][number]) {
  return {
    taxPricingMode: row.tax_pricing_mode,
    discountTreatment: row.discount_treatment,
    apControlAccountId: row.ap_control_account_id,
    supplierAdvanceAccountId: row.supplier_advance_account_id,
    showSupplierTaxIdentifiers: row.show_supplier_tax_identifiers,
  };
}
