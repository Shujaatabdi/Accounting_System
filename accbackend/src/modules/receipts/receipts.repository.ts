import type { Sql } from "../../db/pool";

const header = `r.id, r.receipt_number, r.customer_id, c.display_name AS customer_name, r.branch_id, r.status,
  r.receipt_date::text, r.cash_account_id, r.amount::text, r.unallocated_amount::text, r.unapplied_treatment,
  r.advance_account_id, r.notes, r.journal_entry_id, r.created_by, r.submitted_by, r.approved_by`;

export async function countReceipts(db: Sql, clause: string, params: unknown[]) {
  return db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM receipts r JOIN customers c ON c.id = r.customer_id WHERE ${clause}`,
    params,
  );
}

export async function selectReceipts(db: Sql, clause: string, params: unknown[]) {
  return db.query(
    `SELECT ${header} FROM receipts r JOIN customers c ON c.id = r.customer_id WHERE ${clause}
     ORDER BY r.receipt_date DESC, r.receipt_number DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function selectReceipt(db: Sql, id: string, lock = false) {
  return db.query(`SELECT ${header} FROM receipts r JOIN customers c ON c.id = r.customer_id WHERE r.id = $1${lock ? " FOR UPDATE OF r" : ""}`, [id]);
}

export async function selectAllocations(db: Sql, receiptId: string) {
  return db.query(
    `SELECT a.id, a.invoice_id, i.invoice_number, a.amount::text, a.status, a.journal_entry_id
       FROM receipt_allocations a JOIN invoices i ON i.id = a.invoice_id
      WHERE a.receipt_id = $1 ORDER BY i.invoice_number`,
    [receiptId],
  );
}

export async function insertReceipt(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>(
    `INSERT INTO receipts (
       receipt_number, customer_id, branch_id, status, receipt_date, cash_account_id, amount,
       unallocated_amount, unapplied_treatment, advance_account_id, notes, created_by
     ) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    values,
  );
}

export async function updateReceipt(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE receipts SET customer_id=$1, branch_id=$2, status='draft', receipt_date=$3, cash_account_id=$4,
       amount=$5, unallocated_amount=$6, unapplied_treatment=$7, advance_account_id=$8, notes=$9, updated_at=now()
     WHERE id = $10`,
    [...values, id],
  );
}

export async function replaceDraftAllocations(db: Sql, receiptId: string, lines: Array<{ invoiceId: string; amount: string }>) {
  await db.query("DELETE FROM receipt_allocations WHERE receipt_id = $1 AND status = 'draft'", [receiptId]);
  for (const line of lines) {
    await db.query(
      `INSERT INTO receipt_allocations (receipt_id, invoice_id, amount, status) VALUES ($1,$2,$3,'draft')`,
      [receiptId, line.invoiceId, line.amount],
    );
  }
}

export async function insertAllocation(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>(
    `INSERT INTO receipt_allocations (receipt_id, invoice_id, amount, status, journal_entry_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    values,
  );
}

export async function setReceiptStatus(db: Sql, id: string, sql: string, values: unknown[]) {
  await db.query(`UPDATE receipts SET ${sql}, updated_at = now() WHERE id = $1`, [id, ...values]);
}

export async function setAllocationStatus(db: Sql, id: string, status: string) {
  await db.query("UPDATE receipt_allocations SET status = $2 WHERE id = $1", [id, status]);
}

export async function lockInvoiceOpen(db: Sql, invoiceId: string) {
  return db.query<{
    id: string;
    customer_id: string;
    branch_id: string;
    status: string;
    invoice_number: string;
    open_amount: string;
  }>(
    `SELECT i.id, i.customer_id, i.branch_id, i.status, i.invoice_number,
            (i.total
              - COALESCE((SELECT SUM(total) FROM customer_returns cr WHERE cr.invoice_id = i.id AND cr.status = 'posted'), 0)
              - COALESCE((SELECT SUM(a.amount) FROM receipt_allocations a WHERE a.invoice_id = i.id AND a.status = 'posted'), 0)
            )::text AS open_amount
       FROM invoices i WHERE i.id = $1 FOR UPDATE`,
    [invoiceId],
  );
}

export async function selectCustomerForReceipt(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean }>("SELECT id, is_active FROM customers WHERE id = $1", [id]);
}

export async function selectBranchForReceipt(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean }>("SELECT id, is_active FROM branches WHERE id = $1", [id]);
}

export async function markAllocationPosted(db: Sql, id: string, journalId: string | null) {
  await db.query("UPDATE receipt_allocations SET status = 'posted', journal_entry_id = $2 WHERE id = $1", [id, journalId]);
}

export async function selectCashAccount(db: Sql, id: string) {
  return db.query<{ id: string; account_type: string; is_active: boolean; is_header: boolean }>(
    "SELECT id, account_type, is_active, is_header FROM accounts WHERE id = $1",
    [id],
  );
}

export async function selectAllocation(db: Sql, id: string, lock = false) {
  return db.query<{ id: string; receipt_id: string; invoice_id: string; amount: string; status: string; journal_entry_id: string | null }>(
    `SELECT id, receipt_id, invoice_id, amount::text, status, journal_entry_id FROM receipt_allocations WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
}
