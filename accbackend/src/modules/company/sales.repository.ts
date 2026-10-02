import type { Sql } from "../../db/pool";

export type SalesSettingsRow = {
  tax_pricing_mode: "exclusive" | "inclusive";
  discount_treatment: "reduce_taxable_base";
  unapplied_receipt_treatment: "customer_advance" | "credit_ar";
  ar_control_account_id: string | null;
  customer_advance_account_id: string | null;
};

export async function selectSalesSettings(db: Sql) {
  return db.query<SalesSettingsRow>(
    `SELECT tax_pricing_mode, discount_treatment, unapplied_receipt_treatment,
            ar_control_account_id, customer_advance_account_id
       FROM sales_settings WHERE id = 1`,
  );
}

export async function updateSalesSettings(db: Sql, values: unknown[]) {
  await db.query(
    `UPDATE sales_settings
        SET tax_pricing_mode = $1,
            unapplied_receipt_treatment = $2,
            ar_control_account_id = $3,
            customer_advance_account_id = $4,
            updated_at = now()
      WHERE id = 1`,
    values,
  );
}

export async function selectPostableAccount(db: Sql, id: string) {
  return db.query<{ id: string; account_type: string; is_active: boolean; is_header: boolean }>(
    `SELECT id, account_type, is_active, is_header FROM accounts WHERE id = $1`,
    [id],
  );
}
