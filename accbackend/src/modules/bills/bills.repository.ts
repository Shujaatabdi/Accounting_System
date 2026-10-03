import type { Sql } from "../../db/pool";

const header = `b.id, b.bill_number, b.supplier_id, s.display_name AS supplier_name, b.branch_id,
  b.status, b.bill_date::text, b.due_date::text, b.payment_terms_days, b.due_date_overridden,
  b.tax_pricing_mode, b.discount_treatment, b.notes, b.taxable_total::text, b.tax_total::text, b.total::text,
  b.journal_entry_id, b.created_by, b.submitted_by, b.approved_by, b.posted_by,
  b.snapshot_tax_country_code, b.snapshot_tax_identifier, b.snapshot_party_type,
  b.snapshot_cnic_ntn, b.snapshot_ntn_check_digit, b.snapshot_strn,
  b.snapshot_atl_captured, b.snapshot_atl_status, b.snapshot_atl_checked_at::text AS snapshot_atl_checked_at, b.snapshot_atl_reference`;

export async function countBills(db: Sql, clause: string, params: unknown[]) {
  return db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM supplier_bills b JOIN suppliers s ON s.id = b.supplier_id WHERE ${clause}`,
    params,
  );
}

export async function selectBills(db: Sql, clause: string, params: unknown[]) {
  return db.query(
    `SELECT ${header} FROM supplier_bills b JOIN suppliers s ON s.id = b.supplier_id WHERE ${clause}
     ORDER BY b.bill_date DESC, b.bill_number DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function selectBill(db: Sql, id: string, lock = false) {
  return db.query(
    `SELECT ${header} FROM supplier_bills b JOIN suppliers s ON s.id = b.supplier_id WHERE b.id = $1${lock ? " FOR UPDATE OF b" : ""}`,
    [id],
  );
}

export async function selectBillLines(db: Sql, billId: string) {
  return db.query(
    `SELECT id, line_no, product_id, description, quantity::text, unit_id, unit_factor::text, unit_price::text,
            discount_amount::text, discount_treatment, tax_code_id, tax_pricing_mode, tax_rate::text,
            taxable_base::text, tax_amount::text, line_total::text, purchase_account_id, tax_account_id
       FROM supplier_bill_lines WHERE supplier_bill_id = $1 ORDER BY line_no`,
    [billId],
  );
}

export async function insertBill(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>(
    `INSERT INTO supplier_bills (
       bill_number, supplier_id, branch_id, status, bill_date, due_date, payment_terms_days,
       due_date_overridden, tax_pricing_mode, discount_treatment, notes, taxable_total, tax_total, total, created_by
     ) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    values,
  );
}

export async function updateBill(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE supplier_bills SET supplier_id=$1, branch_id=$2, status='draft', bill_date=$3, due_date=$4,
       payment_terms_days=$5, due_date_overridden=$6, tax_pricing_mode=$7, discount_treatment=$8, notes=$9,
       taxable_total=$10, tax_total=$11, total=$12, updated_at=now()
     WHERE id = $13`,
    [...values, id],
  );
}

export async function replaceBillLines(db: Sql, billId: string, lines: unknown[][]) {
  await db.query("DELETE FROM supplier_bill_lines WHERE supplier_bill_id = $1", [billId]);
  for (const line of lines) {
    await db.query(
      `INSERT INTO supplier_bill_lines (
         supplier_bill_id, line_no, product_id, description, quantity, unit_id, unit_factor, unit_price,
         discount_amount, discount_treatment, tax_code_id, tax_pricing_mode, tax_rate, taxable_base,
         tax_amount, line_total, purchase_account_id, tax_account_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [billId, ...line],
    );
  }
}

export async function setBillTaxSnapshot(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE supplier_bills SET
       snapshot_tax_country_code = $2, snapshot_tax_identifier = $3, snapshot_party_type = $4,
       snapshot_cnic_ntn = $5, snapshot_ntn_check_digit = $6, snapshot_strn = $7, updated_at = now()
     WHERE id = $1`,
    [id, ...values],
  );
}

export async function setBillAtlSnapshot(db: Sql, id: string, status: string | null, checkedAt: string | null, reference: string | null) {
  await db.query(
    `UPDATE supplier_bills SET
       snapshot_atl_captured = true,
       snapshot_atl_status = $2,
       snapshot_atl_checked_at = $3,
       snapshot_atl_reference = $4,
       updated_at = now()
     WHERE id = $1 AND status <> 'posted'`,
    [id, status, checkedAt, reference],
  );
}

export async function lockSupplierTaxProfile(db: Sql, id: string) {
  return db.query<{
    tax_country_code: string | null;
    tax_identifier: string | null;
    party_type: string | null;
    cnic_ntn: string | null;
    ntn_check_digit: string | null;
    strn: string | null;
    atl_status: string | null;
    atl_checked_at: string | null;
    atl_reference: string | null;
  }>(
    `SELECT tax_country_code, tax_identifier, party_type, cnic_ntn, ntn_check_digit, strn,
            atl_status, atl_checked_at::text, atl_reference
       FROM suppliers WHERE id = $1 FOR UPDATE`,
    [id],
  );
}

export async function setBillStatus(db: Sql, id: string, sql: string, values: unknown[]) {
  await db.query(`UPDATE supplier_bills SET ${sql}, updated_at = now() WHERE id = $1`, [id, ...values]);
}

export async function selectSupplierForBill(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean; payment_terms_days: number }>(
    "SELECT id, is_active, payment_terms_days FROM suppliers WHERE id = $1 FOR UPDATE",
    [id],
  );
}

export async function selectBranch(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean }>("SELECT id, is_active FROM branches WHERE id = $1", [id]);
}

export async function selectProductForBill(db: Sql, id: string) {
  return db.query<{
    id: string;
    sku: string;
    name: string;
    is_active: boolean;
    purchase_account_id: string | null;
    tax_code_id: string | null;
  }>("SELECT id, sku, name, is_active, purchase_account_id, tax_code_id FROM products WHERE id = $1", [id]);
}

export async function selectAccountType(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean; is_header: boolean; account_type: string }>(
    "SELECT id, is_active, is_header, account_type FROM accounts WHERE id = $1",
    [id],
  );
}

export async function selectUnitFactor(db: Sql, productId: string, unitId: string) {
  return db.query<{ factor: string }>(
    "SELECT factor::text FROM product_units WHERE product_id = $1 AND unit_id = $2",
    [productId, unitId],
  );
}

export async function selectTaxCode(db: Sql, id: string) {
  return db.query<{
    id: string;
    rate_percent: string;
    purchase_account_id: string | null;
    is_active: boolean;
    effective_from: string;
    effective_to: string | null;
  }>(
    `SELECT id, rate_percent::text, purchase_account_id, is_active, effective_from::text, effective_to::text
       FROM tax_codes WHERE id = $1`,
    [id],
  );
}

export async function activeBillDependencies(db: Sql, billId: string) {
  return db.query(
    `SELECT 1 FROM supplier_payment_allocations a
       JOIN supplier_payments p ON p.id = a.supplier_payment_id
      WHERE a.supplier_bill_id = $1 AND a.status = 'posted' AND p.status = 'posted'
     UNION ALL
     SELECT 1 FROM supplier_returns WHERE supplier_bill_id = $1 AND status = 'posted'`,
    [billId],
  );
}
