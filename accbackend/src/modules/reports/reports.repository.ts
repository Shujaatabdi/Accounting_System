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
