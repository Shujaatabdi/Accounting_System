import { query, type Sql } from "../../db/pool";
import type { AuthUser } from "../auth/auth.types";
import { AppError } from "../../shared/errors";
import type { AccountType, NormalBalance } from "./reports.calculations";

export type ReportFilters = { branchId?: string; from?: string; to?: string; asOf?: string; accountId?: string };

export function movementFilter(actor: AuthUser, filters: ReportFilters, initial: unknown[], dateSql: string) {
  if (filters.branchId && actor.branchIds && !actor.branchIds.includes(filters.branchId)) {
    throw new AppError(403, "BRANCH_SCOPE", "You do not have access to this branch.");
  }
  const params = [...initial];
  let clause = dateSql;
  if (filters.branchId) {
    params.push(filters.branchId);
    clause += ` AND jl.branch_id = $${params.length}`;
  }
  if (actor.branchIds) {
    params.push(actor.branchIds);
    clause += ` AND jl.branch_id = ANY($${params.length}::uuid[])`;
  }
  return { clause, params };
}

export async function trialBalanceRows(clause: string, params: unknown[]) {
  return amountRows(
    `SELECT a.id, a.code, a.name, a.account_type, a.normal_balance,
            COALESCE(SUM(jl.debit), 0)::text AS debit, COALESCE(SUM(jl.credit), 0)::text AS credit
       FROM accounts a
       JOIN journal_lines jl ON jl.account_id = a.id
       JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted' AND ${clause}
      GROUP BY a.id
      ORDER BY a.code`,
    params,
  );
}

export async function profitAndLossRows(clause: string, params: unknown[]) {
  return amountRows(
    `SELECT a.id, a.code, a.name, a.account_type, a.normal_balance,
            COALESCE(SUM(jl.debit), 0)::text AS debit, COALESCE(SUM(jl.credit), 0)::text AS credit
       FROM accounts a
       JOIN journal_lines jl ON jl.account_id = a.id
       JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted' AND ${clause}
      WHERE a.account_type IN ('income', 'expense')
      GROUP BY a.id
      ORDER BY a.account_type, a.code`,
    params,
  );
}

export async function balanceSheetRows(clause: string, params: unknown[]) {
  return amountRows(
    `SELECT a.id, a.code, a.name, a.account_type, a.normal_balance,
            COALESCE(SUM(jl.debit), 0)::text AS debit, COALESCE(SUM(jl.credit), 0)::text AS credit
       FROM accounts a
       JOIN journal_lines jl ON jl.account_id = a.id
       JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted' AND ${clause}
      GROUP BY a.id
      ORDER BY a.account_type, a.code`,
    params,
  );
}

export async function amountRows(sql: string, params: unknown[]) {
  return query<{
    id: string;
    code: string;
    name: string;
    account_type: AccountType;
    normal_balance: NormalBalance;
    debit: string;
    credit: string;
  }>(sql, params);
}

export async function selectAccount(id: string) {
  return query<{ id: string; code: string; name: string; account_type: AccountType; normal_balance: NormalBalance }>(
    "SELECT id, code, name, account_type, normal_balance FROM accounts WHERE id = $1",
    [id],
  );
}

export async function sumMovement(clause: string, params: unknown[]) {
  return query<{ debit: string; credit: string }>(
    `SELECT COALESCE(SUM(jl.debit), 0)::text AS debit, COALESCE(SUM(jl.credit), 0)::text AS credit
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
      WHERE ${clause}`,
    params,
  );
}

export async function selectLedgerLines(clause: string, params: unknown[]) {
  return query<{
    journal_entry_id: string;
    entry_number: string;
    entry_date: string;
    posting_date: string;
    description: string | null;
    debit: string;
    credit: string;
  }>(
    `SELECT je.id AS journal_entry_id, je.entry_number, je.entry_date, je.posting_date, jl.description,
            jl.debit::text AS debit, jl.credit::text AS credit
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
      WHERE ${clause}
      ORDER BY je.posting_date, je.entry_number, jl.line_no`,
    params,
  );
}

export async function selectJournalReport(clause: string, params: unknown[]) {
  return query(
    `SELECT je.id, je.entry_number, je.entry_date, je.posting_date, je.description, je.source_type,
            jl.line_no, COALESCE(jl.account_code_snapshot, a.code) AS account_code,
            COALESCE(jl.account_name_snapshot, a.name) AS account_name,
            jl.debit::text AS debit, jl.credit::text AS credit, jl.description AS line_description
       FROM journal_entries je
       JOIN journal_lines jl ON jl.journal_entry_id = je.id
       JOIN accounts a ON a.id = jl.account_id
      WHERE je.status = 'posted' AND ${clause}
      ORDER BY je.posting_date, je.entry_number, jl.line_no`,
    params,
  );
}

export async function countUnpostedJournals(db: Sql = { query }) {
  return db.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM journal_entries WHERE status IN ('draft', 'pending_approval', 'approved')",
  );
}

export async function countOpenPeriods(db: Sql = { query }) {
  return db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM fiscal_periods WHERE status = 'open'");
}

const activeJournals = `
  active_journals AS (
    SELECT je.id
      FROM journal_entries je
      LEFT JOIN journal_entries rev ON rev.id = je.reversed_by_entry_id
     WHERE je.status = 'posted'
       AND je.posting_date <= $1::date
       AND (je.reversed_by_entry_id IS NULL OR rev.posting_date > $1::date)
  )`;

export async function selectArControlId(db: Sql = { query }) {
  return db.query<{ ar_control_account_id: string | null }>("SELECT ar_control_account_id FROM sales_settings WHERE id = 1");
}

export async function selectArGl(db: Sql, params: unknown[]) {
  return db.query<{ amount: string }>(
    `SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::text AS amount
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.status = 'posted'
        AND je.posting_date <= $1::date
        AND jl.account_id = (SELECT ar_control_account_id FROM sales_settings WHERE id = 1)
        AND ($2::uuid IS NULL OR $2::uuid IS NOT NULL)
        AND ($3::uuid IS NULL OR jl.branch_id = $3)
        AND ($4::uuid[] IS NULL OR jl.branch_id = ANY($4))`,
    params,
  );
}

export async function selectArSubledger(db: Sql, params: unknown[]) {
  return db.query<{ amount: string }>(
    `WITH ${activeJournals}
     SELECT (
       COALESCE((
         SELECT SUM(d.amount) FROM customer_opening_details d
           JOIN journal_lines jl ON jl.id = d.journal_line_id
           JOIN active_journals aj ON aj.id = jl.journal_entry_id
          WHERE ($2::uuid IS NULL OR d.customer_id = $2)
            AND ($3::uuid IS NULL OR jl.branch_id = $3)
            AND ($4::uuid[] IS NULL OR jl.branch_id = ANY($4))
       ), 0)
       + COALESCE((
         SELECT SUM(i.total) FROM invoices i
           JOIN active_journals aj ON aj.id = i.journal_entry_id
          WHERE ($2::uuid IS NULL OR i.customer_id = $2)
            AND ($3::uuid IS NULL OR i.branch_id = $3)
            AND ($4::uuid[] IS NULL OR i.branch_id = ANY($4))
       ), 0)
       - COALESCE((
         SELECT SUM(r.total) FROM customer_returns r
           JOIN active_journals aj ON aj.id = r.journal_entry_id
          WHERE ($2::uuid IS NULL OR r.customer_id = $2)
            AND ($3::uuid IS NULL OR r.branch_id = $3)
            AND ($4::uuid[] IS NULL OR r.branch_id = ANY($4))
       ), 0)
       - COALESCE((
         SELECT SUM(rc.amount) FROM receipts rc
           JOIN active_journals aj ON aj.id = rc.journal_entry_id
          WHERE rc.unapplied_treatment = 'credit_ar'
            AND ($2::uuid IS NULL OR rc.customer_id = $2)
            AND ($3::uuid IS NULL OR rc.branch_id = $3)
            AND ($4::uuid[] IS NULL OR rc.branch_id = ANY($4))
       ), 0)
       - COALESCE((
         SELECT SUM(a.amount) FROM receipt_allocations a
           JOIN receipts rc ON rc.id = a.receipt_id
           JOIN active_journals aj ON aj.id = a.journal_entry_id
          WHERE rc.unapplied_treatment = 'customer_advance'
            AND ($2::uuid IS NULL OR rc.customer_id = $2)
            AND ($3::uuid IS NULL OR rc.branch_id = $3)
            AND ($4::uuid[] IS NULL OR rc.branch_id = ANY($4))
       ), 0)
     )::text AS amount`,
    params,
  );
}

export async function selectOpenInvoices(db: Sql, params: unknown[]) {
  return db.query<{
    id: string;
    invoice_number: string;
    customer_id: string;
    customer_name: string;
    invoice_date: string;
    due_date: string;
    open_amount: string;
  }>(
    `WITH ${activeJournals}
     SELECT i.id, i.invoice_number, i.customer_id, c.display_name AS customer_name,
            i.invoice_date::text, i.due_date::text,
            (i.total
              - COALESCE((SELECT SUM(cr.total) FROM customer_returns cr JOIN active_journals raj ON raj.id = cr.journal_entry_id WHERE cr.invoice_id = i.id), 0)
              - COALESCE((
                  SELECT SUM(a.amount) FROM receipt_allocations a
                    JOIN receipts rc ON rc.id = a.receipt_id
                   WHERE a.invoice_id = i.id
                     AND (
                       a.journal_entry_id IN (SELECT id FROM active_journals)
                       OR (a.journal_entry_id IS NULL AND a.status = 'posted' AND rc.journal_entry_id IN (SELECT id FROM active_journals))
                     )
                ), 0)
            )::text AS open_amount
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN active_journals aj ON aj.id = i.journal_entry_id
      WHERE ($2::uuid IS NULL OR i.customer_id = $2)
        AND ($3::uuid IS NULL OR i.branch_id = $3)
        AND ($4::uuid[] IS NULL OR i.branch_id = ANY($4))
      ORDER BY i.due_date, i.invoice_number`,
    params,
  );
}

export async function selectSalesActivity(db: Sql, params: unknown[]) {
  return db.query<{ kind: string; number: string; doc_date: string; customer_name: string; taxable: string; tax: string; total: string }>(
    `SELECT kind, number, doc_date::text, customer_name, taxable::text, tax::text, total::text FROM (
       SELECT 'invoice' AS kind, i.invoice_number AS number, je.posting_date AS doc_date, c.display_name AS customer_name,
              i.taxable_total AS taxable, i.tax_total AS tax, i.total AS total, i.branch_id
         FROM invoices i
         JOIN journal_entries je ON je.id = i.journal_entry_id
         JOIN customers c ON c.id = i.customer_id
        WHERE je.status = 'posted' AND je.posting_date BETWEEN $1::date AND $2::date
       UNION ALL
       SELECT 'customer_return', r.return_number, je.posting_date, c.display_name, -r.taxable_total, -r.tax_total, -r.total, r.branch_id
         FROM customer_returns r
         JOIN journal_entries je ON je.id = r.journal_entry_id
         JOIN customers c ON c.id = r.customer_id
        WHERE je.status = 'posted' AND je.posting_date BETWEEN $1::date AND $2::date
       UNION ALL
       SELECT 'reversal', je.entry_number, je.posting_date, c.display_name, -i.taxable_total, -i.tax_total, -i.total, i.branch_id
         FROM journal_entries je
         JOIN journal_entries orig ON orig.id = je.reverses_entry_id
         JOIN invoices i ON i.journal_entry_id = orig.id
         JOIN customers c ON c.id = i.customer_id
        WHERE je.status = 'posted' AND je.source_type = 'reversal' AND je.posting_date BETWEEN $1::date AND $2::date
       UNION ALL
       SELECT 'reversal', je.entry_number, je.posting_date, c.display_name, r.taxable_total, r.tax_total, r.total, r.branch_id
         FROM journal_entries je
         JOIN journal_entries orig ON orig.id = je.reverses_entry_id
         JOIN customer_returns r ON r.journal_entry_id = orig.id
         JOIN customers c ON c.id = r.customer_id
        WHERE je.status = 'posted' AND je.source_type = 'reversal' AND je.posting_date BETWEEN $1::date AND $2::date
     ) activity
     WHERE ($3::uuid IS NULL OR branch_id = $3)
       AND ($4::uuid[] IS NULL OR branch_id = ANY($4))
     ORDER BY doc_date, number`,
    params,
  );
}

export async function selectStatementLines(db: Sql, params: unknown[]) {
  return db.query<{ kind: string; number: string; doc_date: string; total: string }>(
    `SELECT kind, number, doc_date::text, total::text FROM (
       SELECT 'invoice' AS kind, i.invoice_number AS number, je.posting_date AS doc_date, i.total AS total, i.branch_id, i.customer_id
         FROM invoices i JOIN journal_entries je ON je.id = i.journal_entry_id
        WHERE je.status = 'posted'
       UNION ALL
       SELECT 'customer_return', r.return_number, je.posting_date, -r.total, r.branch_id, r.customer_id
         FROM customer_returns r JOIN journal_entries je ON je.id = r.journal_entry_id
        WHERE je.status = 'posted'
       UNION ALL
       SELECT 'receipt', rc.receipt_number, je.posting_date, -rc.amount, rc.branch_id, rc.customer_id
         FROM receipts rc JOIN journal_entries je ON je.id = rc.journal_entry_id
        WHERE je.status = 'posted' AND rc.unapplied_treatment = 'credit_ar'
       UNION ALL
       SELECT 'allocation', rc.receipt_number, je.posting_date, -a.amount, rc.branch_id, rc.customer_id
         FROM receipt_allocations a
         JOIN receipts rc ON rc.id = a.receipt_id
         JOIN journal_entries je ON je.id = a.journal_entry_id
        WHERE je.status = 'posted' AND rc.unapplied_treatment = 'customer_advance'
       UNION ALL
       SELECT 'reversal', je.entry_number, je.posting_date,
              CASE WHEN i.id IS NOT NULL THEN -i.total WHEN r.id IS NOT NULL THEN r.total ELSE 0 END,
              COALESCE(i.branch_id, r.branch_id, rc.branch_id),
              COALESCE(i.customer_id, r.customer_id, rc.customer_id)
         FROM journal_entries je
         JOIN journal_entries orig ON orig.id = je.reverses_entry_id
         LEFT JOIN invoices i ON i.journal_entry_id = orig.id
         LEFT JOIN customer_returns r ON r.journal_entry_id = orig.id
         LEFT JOIN receipts rc ON rc.journal_entry_id = orig.id AND rc.unapplied_treatment = 'credit_ar'
        WHERE je.status = 'posted' AND je.source_type = 'reversal'
          AND (i.id IS NOT NULL OR r.id IS NOT NULL OR rc.id IS NOT NULL)
     ) lines
     WHERE customer_id = $1
       AND doc_date BETWEEN $2::date AND $3::date
       AND ($4::uuid IS NULL OR branch_id = $4)
       AND ($5::uuid[] IS NULL OR branch_id = ANY($5))
     ORDER BY doc_date, number`,
    params,
  );
}
