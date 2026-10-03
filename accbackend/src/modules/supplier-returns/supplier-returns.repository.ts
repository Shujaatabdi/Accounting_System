import type { Sql } from "../../db/pool";

const header = `r.id, r.return_number, r.supplier_id, s.display_name AS supplier_name, r.branch_id, r.supplier_bill_id,
  r.unreferenced, r.status, r.return_date::text, r.reason, r.notes, r.taxable_total::text, r.tax_total::text, r.total::text,
  r.journal_entry_id, r.created_by, r.submitted_by, r.approved_by, r.posted_by`;

export async function countReturns(db: Sql, clause: string, params: unknown[]) {
  return db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM supplier_returns r JOIN suppliers s ON s.id = r.supplier_id WHERE ${clause}`,
    params,
  );
}

export async function selectReturns(db: Sql, clause: string, params: unknown[]) {
  return db.query(
    `SELECT ${header} FROM supplier_returns r JOIN suppliers s ON s.id = r.supplier_id WHERE ${clause}
     ORDER BY r.return_date DESC, r.return_number DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function selectReturn(db: Sql, id: string, lock = false) {
  return db.query(
    `SELECT ${header} FROM supplier_returns r JOIN suppliers s ON s.id = r.supplier_id WHERE r.id = $1${lock ? " FOR UPDATE OF r" : ""}`,
    [id],
  );
}

export async function selectReturnLines(db: Sql, returnId: string) {
  return db.query(
    `SELECT id, line_no, supplier_bill_line_id, product_id, description, quantity::text, unit_price::text,
            discount_amount::text, tax_pricing_mode, tax_rate::text, taxable_base::text, tax_amount::text, line_total::text,
            purchase_account_id, tax_account_id, disposition
       FROM supplier_return_lines WHERE supplier_return_id = $1 ORDER BY line_no`,
    [returnId],
  );
}

export async function insertReturn(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>(
    `INSERT INTO supplier_returns (
       return_number, supplier_id, branch_id, supplier_bill_id, unreferenced, status, return_date, reason, notes,
       taxable_total, tax_total, total, created_by
     ) VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    values,
  );
}

export async function updateReturn(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE supplier_returns SET supplier_id=$1, branch_id=$2, supplier_bill_id=$3, unreferenced=$4, status='draft',
       return_date=$5, reason=$6, notes=$7, taxable_total=$8, tax_total=$9, total=$10, updated_at=now()
     WHERE id = $11`,
    [...values, id],
  );
}

export async function replaceReturnLines(db: Sql, returnId: string, lines: unknown[][]) {
  await db.query("DELETE FROM supplier_return_lines WHERE supplier_return_id = $1", [returnId]);
  for (const line of lines) {
    await db.query(
      `INSERT INTO supplier_return_lines (
         supplier_return_id, line_no, supplier_bill_line_id, product_id, description, quantity, unit_price,
         discount_amount, discount_treatment, tax_pricing_mode, tax_rate, taxable_base, tax_amount, line_total,
         purchase_account_id, tax_account_id, disposition
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [returnId, ...line],
    );
  }
}

export async function updateReturnLineAmounts(db: Sql, id: string, taxable: string, tax: string, total: string) {
  await db.query(
    "UPDATE supplier_return_lines SET taxable_base = $2, tax_amount = $3, line_total = $4 WHERE id = $1",
    [id, taxable, tax, total],
  );
}

export async function setReturnStatus(db: Sql, id: string, sql: string, values: unknown[]) {
  await db.query(`UPDATE supplier_returns SET ${sql}, updated_at = now() WHERE id = $1`, [id, ...values]);
}

export async function lockBillLine(db: Sql, billLineId: string) {
  return db.query<{
    id: string;
    supplier_bill_id: string;
    bill_status: string;
    supplier_id: string;
    description: string;
    quantity: string;
    unit_price: string;
    discount_amount: string;
    discount_treatment: string;
    tax_pricing_mode: string;
    tax_rate: string;
    taxable_base: string;
    tax_amount: string;
    line_total: string;
    purchase_account_id: string;
    tax_account_id: string | null;
    product_id: string | null;
  }>(
    `SELECT l.id, l.supplier_bill_id, b.status AS bill_status, b.supplier_id, l.description, l.quantity::text,
            l.unit_price::text, l.discount_amount::text, l.discount_treatment, l.tax_pricing_mode, l.tax_rate::text,
            l.taxable_base::text, l.tax_amount::text, l.line_total::text, l.purchase_account_id, l.tax_account_id, l.product_id
       FROM supplier_bill_lines l
       JOIN supplier_bills b ON b.id = l.supplier_bill_id
      WHERE l.id = $1
      FOR UPDATE OF l`,
    [billLineId],
  );
}

export async function returnedAgainstLine(db: Sql, billLineId: string) {
  return db.query<{ quantity: string; taxable_base: string; tax_amount: string; line_total: string }>(
    `SELECT COALESCE(SUM(l.quantity), 0)::text AS quantity,
            COALESCE(SUM(l.taxable_base), 0)::text AS taxable_base,
            COALESCE(SUM(l.tax_amount), 0)::text AS tax_amount,
            COALESCE(SUM(l.line_total), 0)::text AS line_total
       FROM supplier_return_lines l
       JOIN supplier_returns r ON r.id = l.supplier_return_id
      WHERE l.supplier_bill_line_id = $1 AND r.status = 'posted'`,
    [billLineId],
  );
}

export async function selectSupplierActive(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean }>("SELECT id, is_active FROM suppliers WHERE id = $1", [id]);
}

export async function selectBranchActive(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean }>("SELECT id, is_active FROM branches WHERE id = $1", [id]);
}

export async function selectProductReturn(db: Sql, id: string) {
  return db.query<{ id: string; name: string; is_active: boolean; purchase_account_id: string | null }>(
    "SELECT id, name, is_active, purchase_account_id FROM products WHERE id = $1",
    [id],
  );
}

export async function selectTaxForReturn(db: Sql, id: string) {
  return db.query<{
    rate_percent: string;
    purchase_account_id: string | null;
    is_active: boolean;
    effective_from: string;
    effective_to: string | null;
  }>(
    `SELECT rate_percent::text, purchase_account_id, is_active, effective_from::text, effective_to::text
       FROM tax_codes WHERE id = $1`,
    [id],
  );
}

export async function selectExpenseAccount(db: Sql, id: string) {
  return db.query<{ is_active: boolean; is_header: boolean; account_type: string }>(
    "SELECT is_active, is_header, account_type FROM accounts WHERE id = $1",
    [id],
  );
}
