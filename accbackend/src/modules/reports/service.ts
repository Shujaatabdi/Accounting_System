import { query } from "../../db/pool";
import { assertIsoDate } from "../../lib/dates";
import { AppError, one } from "../../lib/errors";
import { money } from "../../lib/money";
import type { AuthUser } from "../auth/types";
import {
  presentBalanceSheet,
  presentProfitAndLoss,
  presentTrialBalance,
  runningBalances,
  signedBalance,
  type AccountType,
  type AmountRow,
  type NormalBalance,
} from "./calculations";

type Filters = { branchId?: string; from?: string; to?: string; asOf?: string; accountId?: string };

export async function trialBalance(actor: AuthUser, filters: Filters) {
  const asOf = requiredDate(filters.asOf, "asOf");
  const { clause, params } = movementFilter(actor, filters, [asOf], "je.posting_date <= $1::date");
  const rows = await amountRows(
    `SELECT a.id, a.code, a.name, a.account_type, a.normal_balance,
            COALESCE(SUM(jl.debit), 0)::text AS debit, COALESCE(SUM(jl.credit), 0)::text AS credit
       FROM accounts a
       JOIN journal_lines jl ON jl.account_id = a.id
       JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted' AND ${clause}
      GROUP BY a.id
      ORDER BY a.code`,
    params,
  );
  const presented = presentTrialBalance(rows);
  return {
    asOf,
    basis: "posting_date",
    rows: rows.map((row, index) => ({
      accountId: row.id,
      code: row.code,
      name: row.name,
      accountType: row.accountType,
      debitBalance: presented.rows[index].debitBalance,
      creditBalance: presented.rows[index].creditBalance,
    })),
    totalDebit: presented.totalDebit,
    totalCredit: presented.totalCredit,
    balances: presented.balances,
  };
}

export async function profitAndLoss(actor: AuthUser, filters: Filters) {
  const from = requiredDate(filters.from, "from");
  const to = requiredDate(filters.to, "to");
  const { clause, params } = movementFilter(actor, filters, [from, to], "je.posting_date BETWEEN $1::date AND $2::date");
  const rows = await amountRows(
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
  const presented = presentProfitAndLoss(rows);
  return {
    from,
    to,
    basis: "posting_date",
    rows: rows.map((row, index) => ({
      accountId: row.id,
      code: row.code,
      name: row.name,
      accountType: row.accountType,
      amount: presented.rows[index].amount,
    })),
    totalIncome: presented.totalIncome,
    totalExpense: presented.totalExpense,
    netIncome: presented.netIncome,
  };
}

export async function balanceSheet(actor: AuthUser, filters: Filters) {
  const asOf = requiredDate(filters.asOf, "asOf");
  const { clause, params } = movementFilter(actor, filters, [asOf], "je.posting_date <= $1::date");
  const rows = await amountRows(
    `SELECT a.id, a.code, a.name, a.account_type, a.normal_balance,
            COALESCE(SUM(jl.debit), 0)::text AS debit, COALESCE(SUM(jl.credit), 0)::text AS credit
       FROM accounts a
       JOIN journal_lines jl ON jl.account_id = a.id
       JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted' AND ${clause}
      GROUP BY a.id
      ORDER BY a.account_type, a.code`,
    params,
  );
  const presented = presentBalanceSheet(rows);
  const sections = (type: AccountType) =>
    rows
      .filter((row) => row.accountType === type)
      .map((row) => ({
        accountId: row.id,
        code: row.code,
        name: row.name,
        amount: money(signedBalance(row.normalBalance, row.debit, row.credit)),
      }));
  return {
    asOf,
    basis: "posting_date",
    assets: sections("asset"),
    liabilities: sections("liability"),
    equity: sections("equity"),
    unclosedProfitOrLoss: presented.unclosedProfitOrLoss,
    totalAssets: presented.assets,
    totalLiabilities: presented.liabilities,
    totalEquity: presented.totalEquity,
    totalLiabilitiesAndEquity: presented.totalLiabilitiesAndEquity,
    balances: presented.balances,
    note: "Unclosed profit or loss is the net of income and expense accounts. It is not a posted closing entry. After a closing journal moves that net into retained earnings, this line is zero.",
  };
}

export async function generalLedger(actor: AuthUser, filters: Filters) {
  if (!filters.accountId) throw new AppError(400, "VALIDATION", "Choose an account.");
  const from = filters.from ? requiredDate(filters.from, "from") : "0001-01-01";
  const to = filters.to ? requiredDate(filters.to, "to") : "9999-12-31";
  const account = one(
    (
      await query<{ id: string; code: string; name: string; account_type: AccountType; normal_balance: NormalBalance }>(
        "SELECT id, code, name, account_type, normal_balance FROM accounts WHERE id = $1",
        [filters.accountId],
      )
    ).rows,
    "Account not found.",
  );
  const openingFilter = movementFilter(actor, filters, [filters.accountId, from], "jl.account_id = $1 AND je.posting_date < $2::date");
  const opening = one(
    (
      await query<{ debit: string; credit: string }>(
        `SELECT COALESCE(SUM(jl.debit), 0)::text AS debit, COALESCE(SUM(jl.credit), 0)::text AS credit
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
          WHERE ${openingFilter.clause}`,
        openingFilter.params,
      )
    ).rows,
  );
  const lineFilter = movementFilter(
    actor,
    filters,
    [filters.accountId, from, to],
    "jl.account_id = $1 AND je.posting_date BETWEEN $2::date AND $3::date",
  );
  const lines = await query<{
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
      WHERE ${lineFilter.clause}
      ORDER BY je.posting_date, je.entry_number, jl.line_no`,
    lineFilter.params,
  );
  const running = runningBalances(
    account.normal_balance,
    money(signedBalance(account.normal_balance, opening.debit, opening.credit)),
    lines.rows,
  );
  return {
    basis: "posting_date",
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      accountType: account.account_type,
      normalBalance: account.normal_balance,
    },
    from,
    to,
    openingBalance: running.openingBalance,
    lines: lines.rows.map((line, index) => ({
      journalEntryId: line.journal_entry_id,
      entryNumber: line.entry_number,
      entryDate: line.entry_date,
      postingDate: line.posting_date,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
      runningBalance: running.lines[index].runningBalance,
    })),
    closingBalance: running.closingBalance,
  };
}

export async function journalReport(actor: AuthUser, filters: Filters) {
  const from = requiredDate(filters.from, "from");
  const to = requiredDate(filters.to, "to");
  const { clause, params } = movementFilter(actor, filters, [from, to], "je.posting_date BETWEEN $1::date AND $2::date");
  const rows = await query(
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
  return {
    from,
    to,
    basis: "posting_date",
    rows: rows.rows.map((row) => ({
      journalEntryId: row.id as string,
      entryNumber: row.entry_number as string,
      entryDate: row.entry_date as string,
      postingDate: row.posting_date as string,
      description: row.description as string,
      sourceType: row.source_type as string,
      lineNo: row.line_no as number,
      accountCode: row.account_code as string,
      accountName: row.account_name as string,
      lineDescription: row.line_description as string | null,
      debit: row.debit as string,
      credit: row.credit as string,
    })),
  };
}

function movementFilter(actor: AuthUser, filters: Filters, initial: unknown[], dateSql: string) {
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

async function amountRows(sql: string, params: unknown[]): Promise<Array<AmountRow & { id: string; code: string; name: string }>> {
  const rows = await query<{
    id: string;
    code: string;
    name: string;
    account_type: AccountType;
    normal_balance: NormalBalance;
    debit: string;
    credit: string;
  }>(sql, params);
  return rows.rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    accountType: row.account_type,
    normalBalance: row.normal_balance,
    debit: row.debit,
    credit: row.credit,
  }));
}

function requiredDate(value: string | undefined, name: string) {
  if (!value) throw new AppError(400, "VALIDATION", `${name} is required.`);
  assertIsoDate(value);
  return value;
}
