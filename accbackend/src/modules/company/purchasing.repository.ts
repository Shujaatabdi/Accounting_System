import type { Sql } from "../../db/pool";

export type PurchasingSettingsRow = {
  tax_pricing_mode: "exclusive" | "inclusive";
  discount_treatment: "reduce_taxable_base";
  ap_control_account_id: string | null;
  supplier_advance_account_id: string | null;
  show_supplier_tax_identifiers: boolean;
};

export async function selectPurchasingSettings(db: Sql) {
  return db.query<PurchasingSettingsRow>(
    `SELECT tax_pricing_mode, discount_treatment, ap_control_account_id,
            supplier_advance_account_id, show_supplier_tax_identifiers
       FROM purchasing_settings WHERE id = 1`,
  );
}

export async function updatePurchasingSettings(db: Sql, values: unknown[]) {
  await db.query(
    `UPDATE purchasing_settings
        SET tax_pricing_mode = $1,
            ap_control_account_id = $2,
            supplier_advance_account_id = $3,
            show_supplier_tax_identifiers = $4,
            updated_at = now()
      WHERE id = 1`,
    values,
  );
}
