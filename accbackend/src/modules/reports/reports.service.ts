import { query } from "../../db/pool";
import { addDays, assertIsoDate } from "../../shared/dates";
import { AppError, one } from "../../shared/errors";
import { decimal, money } from "../../shared/money";
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
  selectArControlId,
  selectArGl,
  selectArSubledger,
  selectJournalReport,
  selectLedgerLines,
  selectOpenInvoices,
  selectSalesActivity,
  selectStatementLines,
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

export async function receivablesAging(actor: AuthUser, filters: { asOf?: string; customerId?: string; branchId?: string }) {
  const asOf = requiredDate(filters.asOf, "asOf");
  await assertReconciled(actor, asOf, filters.branchId);
  const rows = await selectOpenInvoices({ query }, scopeParams(asOf, filters, actor));
  const buckets = { current: decimal("0"), days1To30: decimal("0"), days31To60: decimal("0"), days61To90: decimal("0"), days91Plus: decimal("0") };
  const invoices = rows.rows.flatMap((row) => {
    const open = decimal(row.open_amount);
    if (open.lte(0)) return [];
    const days = daysBetween(row.due_date, asOf);
    const bucket = days <= 0 ? "current" : days <= 30 ? "days1To30" : days <= 60 ? "days31To60" : days <= 90 ? "days61To90" : "days91Plus";
    buckets[bucket] = buckets[bucket].plus(open);
    return [{
      invoiceId: row.id,
      invoiceNumber: row.invoice_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      openAmount: money(open),
      bucket,
    }];
  });
  return {
    asOf,
    invoices,
    totals: {
      current: money(buckets.current),
      days1To30: money(buckets.days1To30),
      days31To60: money(buckets.days31To60),
      days61To90: money(buckets.days61To90),
      days91Plus: money(buckets.days91Plus),
      open: money(buckets.current.plus(buckets.days1To30).plus(buckets.days31To60).plus(buckets.days61To90).plus(buckets.days91Plus)),
    },
  };
}

export async function customerStatement(actor: AuthUser, filters: { customerId: string; from: string; to: string; branchId?: string }) {
  assertIsoDate(filters.from);
  assertIsoDate(filters.to);
  const openingDate = addDays(filters.from, -1);
  await assertReconciled(actor, openingDate, filters.branchId);
  await assertReconciled(actor, filters.to, filters.branchId);
  const opening = decimal(one((await selectArSubledger({ query }, scopeParams(openingDate, filters, actor))).rows).amount);
  const lines = await selectStatementLines({ query }, [filters.customerId, filters.from, filters.to, filters.branchId ?? null, actor.branchIds]);
  let balance = opening;
  const rows = lines.rows.map((line) => {
    balance = balance.plus(line.total);
    return { kind: line.kind, number: line.number, date: line.doc_date, amount: line.total, balance: money(balance) };
  });
  return { customerId: filters.customerId, from: filters.from, to: filters.to, openingBalance: money(opening), lines: rows, closingBalance: money(balance) };
}

export async function salesReport(actor: AuthUser, filters: { from?: string; to?: string; branchId?: string }) {
  const from = requiredDate(filters.from, "from");
  const to = requiredDate(filters.to, "to");
  const rows = await selectSalesActivity({ query }, [from, to, filters.branchId ?? null, actor.branchIds]);
  const totals = rows.rows.reduce((sum, row) => ({
    taxable: sum.taxable.plus(row.taxable),
    tax: sum.tax.plus(row.tax),
    total: sum.total.plus(row.total),
  }), { taxable: decimal("0"), tax: decimal("0"), total: decimal("0") });
  return {
    from,
    to,
    rows: rows.rows.map((row) => ({
      kind: row.kind, number: row.number, date: row.doc_date, customerName: row.customer_name,
      taxable: row.taxable, tax: row.tax, total: row.total,
    })),
    taxableTotal: money(totals.taxable),
    taxTotal: money(totals.tax),
    total: money(totals.total),
  };
}

async function assertReconciled(actor: AuthUser, asOf: string, branchId?: string) {
  const control = one((await selectArControlId()).rows);
  if (!control.ar_control_account_id) {
    throw new AppError(409, "AR_CONTROL", "Choose the receivable control account before running a receivables report.");
  }
  if (branchId && actor.branchIds && !actor.branchIds.includes(branchId)) {
    throw new AppError(403, "BRANCH_SCOPE", "You do not have access to this branch.");
  }
  const params = scopeParams(asOf, { branchId }, actor);
  const gl = decimal(one((await selectArGl({ query }, params)).rows).amount);
  const subledger = decimal(one((await selectArSubledger({ query }, params)).rows).amount);
  if (!gl.eq(subledger)) {
    throw new AppError(409, "RECONCILIATION", "Customer receivables do not match the receivable control account, so this report was not produced.");
  }
  return { gl: money(gl), subledger: money(subledger) };
}

function scopeParams(asOf: string, filters: { customerId?: string; branchId?: string }, actor: AuthUser) {
  return [asOf, filters.customerId ?? null, filters.branchId ?? null, actor.branchIds];
}

function daysBetween(due: string, asOf: string) {
  const [dy, dm, dd] = due.split("-").map(Number);
  const [ay, am, ad] = asOf.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(dy, dm - 1, dd)) / 86400000);
}

function requiredDate(value: string | undefined, name: string) {
  if (!value) throw new AppError(400, "VALIDATION", `${name} is required.`);
  assertIsoDate(value);
  return value;
}
