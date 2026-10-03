import type { Sql } from "../../db/pool";

const header = `i.id, i.invoice_number, i.customer_id, c.display_name AS customer_name, i.branch_id,
  i.status, i.invoice_date::text, i.due_date::text, i.payment_terms_days, i.due_date_overridden,
  i.tax_pricing_mode, i.discount_treatment, i.notes, i.taxable_total::text, i.tax_total::text, i.total::text,
  i.journal_entry_id, i.created_by, i.submitted_by, i.approved_by, i.posted_by,
  i.snapshot_tax_country_code, i.snapshot_tax_identifier, i.snapshot_party_type,
  i.snapshot_cnic_ntn, i.snapshot_ntn_check_digit, i.snapshot_strn`;

export async function countInvoices(db: Sql, clause: string, params: unknown[]) {
  return db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE ${clause}`,
    params,
  );
}

export async function selectInvoices(db: Sql, clause: string, params: unknown[]) {
  return db.query(
    `SELECT ${header} FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE ${clause}
     ORDER BY i.invoice_date DESC, i.invoice_number DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function selectInvoice(db: Sql, id: string, lock = false) {
  return db.query(
    `SELECT ${header} FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = $1${lock ? " FOR UPDATE OF i" : ""}`,
    [id],
  );
}

export async function selectInvoiceLines(db: Sql, invoiceId: string) {
  return db.query(
    `SELECT id, line_no, product_id, description, quantity::text, unit_id, unit_factor::text, unit_price::text,
            discount_amount::text, discount_treatment, tax_code_id, tax_pricing_mode, tax_rate::text,
            taxable_base::text, tax_amount::text, line_total::text, sales_account_id, tax_account_id
       FROM invoice_lines WHERE invoice_id = $1 ORDER BY line_no`,
    [invoiceId],
  );
}

export async function insertInvoice(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>(
    `INSERT INTO invoices (
       invoice_number, customer_id, branch_id, status, invoice_date, due_date, payment_terms_days,
       due_date_overridden, tax_pricing_mode, discount_treatment, notes, taxable_total, tax_total, total, created_by
     ) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    values,
  );
}

export async function updateInvoice(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE invoices SET customer_id=$1, branch_id=$2, status='draft', invoice_date=$3, due_date=$4,
       payment_terms_days=$5, due_date_overridden=$6, tax_pricing_mode=$7, discount_treatment=$8, notes=$9,
       taxable_total=$10, tax_total=$11, total=$12, updated_at=now()
     WHERE id = $13`,
    [...values, id],
  );
}

export async function replaceInvoiceLines(db: Sql, invoiceId: string, lines: unknown[][]) {
  await db.query("DELETE FROM invoice_lines WHERE invoice_id = $1", [invoiceId]);
  for (const line of lines) {
    await db.query(
      `INSERT INTO invoice_lines (
         invoice_id, line_no, product_id, description, quantity, unit_id, unit_factor, unit_price,
         discount_amount, discount_treatment, tax_code_id, tax_pricing_mode, tax_rate, taxable_base,
         tax_amount, line_total, sales_account_id, tax_account_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [invoiceId, ...line],
    );
  }
}

export async function setInvoiceCustomerTaxSnapshot(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE invoices SET
       snapshot_tax_country_code = $2,
       snapshot_tax_identifier = $3,
       snapshot_party_type = $4,
       snapshot_cnic_ntn = $5,
       snapshot_ntn_check_digit = $6,
       snapshot_strn = $7,
       updated_at = now()
     WHERE id = $1`,
    [id, ...values],
  );
}

export async function lockCustomerTaxProfile(db: Sql, id: string) {
  return db.query<{
    tax_country_code: string | null;
    tax_identifier: string | null;
    party_type: string | null;
    cnic_ntn: string | null;
    ntn_check_digit: string | null;
    strn: string | null;
  }>(
    `SELECT tax_country_code, tax_identifier, party_type, cnic_ntn, ntn_check_digit, strn
       FROM customers WHERE id = $1 FOR UPDATE`,
    [id],
  );
}

export async function setInvoiceStatus(db: Sql, id: string, sql: string, values: unknown[]) {
  await db.query(`UPDATE invoices SET ${sql}, updated_at = now() WHERE id = $1`, [id, ...values]);
}

export async function selectCustomerForSale(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean; payment_terms_days: number; credit_limit: string | null }>(
    "SELECT id, is_active, payment_terms_days, credit_limit::text FROM customers WHERE id = $1 FOR UPDATE",
    [id],
  );
}

export async function selectBranch(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean }>("SELECT id, is_active FROM branches WHERE id = $1", [id]);
}

export async function selectProductForSale(db: Sql, id: string) {
  return db.query<{
    id: string;
    name: string;
    is_active: boolean;
    sales_account_id: string | null;
    return_account_id: string | null;
    tax_code_id: string | null;
  }>("SELECT id, name, is_active, sales_account_id, return_account_id, tax_code_id FROM products WHERE id = $1", [id]);
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
    sales_account_id: string | null;
    is_active: boolean;
    effective_from: string;
    effective_to: string | null;
  }>(
    `SELECT id, rate_percent::text, sales_account_id, is_active, effective_from::text, effective_to::text
       FROM tax_codes WHERE id = $1`,
    [id],
  );
}

export async function activeInvoiceDependencies(db: Sql, invoiceId: string) {
  return db.query(
    `SELECT 1 FROM receipt_allocations a
       JOIN receipts r ON r.id = a.receipt_id
      WHERE a.invoice_id = $1 AND a.status = 'posted' AND r.status = 'posted'
     UNION ALL
     SELECT 1 FROM customer_returns WHERE invoice_id = $1 AND status = 'posted'`,
    [invoiceId],
  );
}
