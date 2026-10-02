import { assertIsoDate } from "../../shared/dates";
import { AppError, one } from "../../shared/errors";
import { money } from "../../shared/money";
import type { AuthUser } from "../auth/auth.types";
import { getCompany } from "../company/company.service";
import { todayInTimeZone } from "../../shared/dates";
import {
  presentBalanceSheet,
  presentProfitAndLoss,
  presentTrialBalance,
  runningBalances,
  signedBalance,
  type AccountType,
  type AmountRow,
} from "./reports.calculations";
import {
  balanceSheetRows,
  countOpenPeriods,
  countUnpostedJournals,
  movementFilter,
  profitAndLossRows,
  selectAccount,
  selectJournalReport,
  selectLedgerLines,
  sumMovement,
  trialBalanceRows,
  type ReportFilters,
} from "./reports.repository";

export async function trialBalance(actor: AuthUser, filters: ReportFilters) {
  const asOf = requiredDate(filters.asOf, "asOf");
  const { clause, params } = movementFilter(actor, filters, [asOf], "je.posting_date <= $1::date");
  const rows = mapAmountRows(await trialBalanceRows(clause, params));
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

export async function profitAndLoss(actor: AuthUser, filters: ReportFilters) {
  const from = requiredDate(filters.from, "from");
  const to = requiredDate(filters.to, "to");
  const { clause, params } = movementFilter(actor, filters, [from, to], "je.posting_date BETWEEN $1::date AND $2::date");
  const rows = mapAmountRows(await profitAndLossRows(clause, params));
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

export async function balanceSheet(actor: AuthUser, filters: ReportFilters) {
  const asOf = requiredDate(filters.asOf, "asOf");
  const { clause, params } = movementFilter(actor, filters, [asOf], "je.posting_date <= $1::date");
  const rows = mapAmountRows(await balanceSheetRows(clause, params));
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

export async function generalLedger(actor: AuthUser, filters: ReportFilters) {
  if (!filters.accountId) throw new AppError(400, "VALIDATION", "Choose an account.");
  const from = filters.from ? requiredDate(filters.from, "from") : "0001-01-01";
  const to = filters.to ? requiredDate(filters.to, "to") : "9999-12-31";
  const account = one((await selectAccount(filters.accountId)).rows, "Account not found.");
  const openingFilter = movementFilter(actor, filters, [filters.accountId, from], "jl.account_id = $1 AND je.posting_date < $2::date");
  const opening = one((await sumMovement(openingFilter.clause, openingFilter.params)).rows);
  const lineFilter = movementFilter(
    actor,
    filters,
    [filters.accountId, from, to],
    "jl.account_id = $1 AND je.posting_date BETWEEN $2::date AND $3::date",
  );
  const lines = await selectLedgerLines(lineFilter.clause, lineFilter.params);
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

export async function journalReport(actor: AuthUser, filters: ReportFilters) {
  const from = requiredDate(filters.from, "from");
  const to = requiredDate(filters.to, "to");
  const { clause, params } = movementFilter(actor, filters, [from, to], "je.posting_date BETWEEN $1::date AND $2::date");
  const rows = await selectJournalReport(clause, params);
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

export async function getDashboard(actor: AuthUser) {
  const company = await getCompany();
  const can = (code: string) => actor.isCompanyAdmin || actor.permissions.includes(code);
  const body: Record<string, unknown> = {
    company: {
      displayName: company.displayName,
      legalName: company.legalName,
      currencyName: company.currencyName,
      currencySymbol: company.currencySymbol,
      currencyDecimalPlaces: company.currencyDecimalPlaces,
      countryCode: company.countryCode,
      timezone: company.timezone,
      profilePlaceholder: company.profilePlaceholder,
    },
  };
  if (can("journals.view")) {
    const drafts = await countUnpostedJournals();
    body.unpostedJournals = Number(drafts.rows[0].count);
  }
  if (can("periods.view")) {
    const periods = await countOpenPeriods();
    body.openPeriods = Number(periods.rows[0].count);
  }
  if (can("reports.view")) {
    body.trialBalance = await trialBalance(actor, { asOf: todayInTimeZone(company.timezone) });
  }
  return body;
}

function mapAmountRows(rows: Awaited<ReturnType<typeof trialBalanceRows>>): Array<AmountRow & { id: string; code: string; name: string }> {
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
