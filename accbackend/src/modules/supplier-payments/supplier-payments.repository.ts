import type { Sql } from "../../db/pool";

const header = `p.id, p.payment_number, p.supplier_id, s.display_name AS supplier_name, p.branch_id, p.status,
  p.payment_date::text, p.cash_account_id, p.amount::text, p.unallocated_amount::text, p.ap_treatment,
  p.advance_account_id, p.notes, p.journal_entry_id, p.created_by, p.submitted_by, p.approved_by`;

export async function countPayments(db: Sql, clause: string, params: unknown[]) {
  return db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM supplier_payments p JOIN suppliers s ON s.id = p.supplier_id WHERE ${clause}`,
    params,
  );
}

export async function selectPayments(db: Sql, clause: string, params: unknown[]) {
  return db.query(
    `SELECT ${header} FROM supplier_payments p JOIN suppliers s ON s.id = p.supplier_id WHERE ${clause}
     ORDER BY p.payment_date DESC, p.payment_number DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function selectPayment(db: Sql, id: string, lock = false) {
  return db.query(
    `SELECT ${header} FROM supplier_payments p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = $1${lock ? " FOR UPDATE OF p" : ""}`,
    [id],
  );
}

export async function selectAllocations(db: Sql, paymentId: string) {
  return db.query(
    `SELECT a.id, a.supplier_bill_id, b.bill_number, a.amount::text, a.status, a.journal_entry_id
       FROM supplier_payment_allocations a JOIN supplier_bills b ON b.id = a.supplier_bill_id
      WHERE a.supplier_payment_id = $1 ORDER BY b.bill_number`,
    [paymentId],
  );
}

export async function insertPayment(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>(
    `INSERT INTO supplier_payments (
       payment_number, supplier_id, branch_id, status, payment_date, cash_account_id, amount,
       unallocated_amount, ap_treatment, advance_account_id, notes, created_by
     ) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    values,
  );
}

export async function updatePayment(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE supplier_payments SET supplier_id=$1, branch_id=$2, status='draft', payment_date=$3, cash_account_id=$4,
       amount=$5, unallocated_amount=$6, ap_treatment=$7, advance_account_id=$8, notes=$9, updated_at=now()
     WHERE id = $10`,
    [...values, id],
  );
}

export async function replaceDraftAllocations(db: Sql, paymentId: string, lines: Array<{ billId: string; amount: string }>) {
  await db.query("DELETE FROM supplier_payment_allocations WHERE supplier_payment_id = $1 AND status = 'draft'", [paymentId]);
  for (const line of lines) {
    await db.query(
      `INSERT INTO supplier_payment_allocations (supplier_payment_id, supplier_bill_id, amount, status) VALUES ($1,$2,$3,'draft')`,
      [paymentId, line.billId, line.amount],
    );
  }
}

export async function insertAllocation(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>(
    `INSERT INTO supplier_payment_allocations (supplier_payment_id, supplier_bill_id, amount, status, journal_entry_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    values,
  );
}

export async function selectAllocation(db: Sql, id: string, lock = false) {
  return db.query<{
    id: string;
    supplier_payment_id: string;
    supplier_bill_id: string;
    amount: string;
    status: string;
    journal_entry_id: string | null;
  }>(
    `SELECT id, supplier_payment_id, supplier_bill_id, amount::text, status, journal_entry_id
       FROM supplier_payment_allocations WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
}

export async function markAllocationPosted(db: Sql, id: string, journalId: string | null) {
  await db.query(
    "UPDATE supplier_payment_allocations SET status = 'posted', journal_entry_id = $2 WHERE id = $1",
    [id, journalId],
  );
}

export async function setAllocationStatus(db: Sql, id: string, status: string) {
  await db.query("UPDATE supplier_payment_allocations SET status = $2 WHERE id = $1", [id, status]);
}

export async function setPaymentStatus(db: Sql, id: string, sql: string, values: unknown[]) {
  await db.query(`UPDATE supplier_payments SET ${sql}, updated_at = now() WHERE id = $1`, [id, ...values]);
}

export async function selectSupplierForPayment(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean }>("SELECT id, is_active FROM suppliers WHERE id = $1", [id]);
}

export async function selectBranch(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean }>("SELECT id, is_active FROM branches WHERE id = $1", [id]);
}

export async function selectCashAccount(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean; is_header: boolean; account_type: string }>(
    "SELECT id, is_active, is_header, account_type FROM accounts WHERE id = $1",
    [id],
  );
}

export async function lockBillOpen(db: Sql, billId: string) {
  return db.query<{
    id: string;
    supplier_id: string;
    branch_id: string;
    status: string;
    bill_number: string;
    open_amount: string;
  }>(
    `SELECT b.id, b.supplier_id, b.branch_id, b.status, b.bill_number,
            (b.total
              - COALESCE((SELECT SUM(total) FROM supplier_returns r WHERE r.supplier_bill_id = b.id AND r.status = 'posted'), 0)
              - COALESCE((SELECT SUM(a.amount) FROM supplier_payment_allocations a WHERE a.supplier_bill_id = b.id AND a.status = 'posted'), 0)
            )::text AS open_amount
       FROM supplier_bills b WHERE b.id = $1 FOR UPDATE`,
    [billId],
  );
}
