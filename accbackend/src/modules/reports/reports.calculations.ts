import type Decimal from "decimal.js";
import { decimal, money } from "../../shared/money";

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type NormalBalance = "debit" | "credit";

export type AmountRow = {
  accountType: AccountType;
  normalBalance: NormalBalance;
  debit: string;
  credit: string;
};

export function normalBalanceFor(accountType: AccountType): NormalBalance {
  return accountType === "asset" || accountType === "expense" ? "debit" : "credit";
}

export function signedBalance(normalBalance: NormalBalance, debit: string, credit: string): Decimal {
  const left = decimal(debit);
  const right = decimal(credit);
  return normalBalance === "debit" ? left.minus(right) : right.minus(left);
}

export function presentTrialBalance(rows: AmountRow[]) {
  let totalDebit = decimal("0");
  let totalCredit = decimal("0");
  const presented = rows.map((row) => {
    const net = decimal(row.debit).minus(decimal(row.credit));
    const debitBalance = net.gt(0) ? net : decimal("0");
    const creditBalance = net.lt(0) ? net.abs() : decimal("0");
    totalDebit = totalDebit.plus(debitBalance);
    totalCredit = totalCredit.plus(creditBalance);
    return {
      debitBalance: money(debitBalance),
      creditBalance: money(creditBalance),
    };
  });
  return {
    rows: presented,
    totalDebit: money(totalDebit),
    totalCredit: money(totalCredit),
    balances: totalDebit.eq(totalCredit),
  };
}

export function presentProfitAndLoss(rows: AmountRow[]) {
  let income = decimal("0");
  let expense = decimal("0");
  const presented = rows.map((row) => {
    const amount = signedBalance(row.normalBalance, row.debit, row.credit);
    if (row.accountType === "income") income = income.plus(amount);
    if (row.accountType === "expense") expense = expense.plus(amount);
    return { amount: money(amount) };
  });
  const netIncome = income.minus(expense);
  return {
    rows: presented,
    totalIncome: money(income),
    totalExpense: money(expense),
    netIncome: money(netIncome),
  };
}

export function presentBalanceSheet(rows: AmountRow[]) {
  let assets = decimal("0");
  let liabilities = decimal("0");
  let equity = decimal("0");
  let unclosed = decimal("0");
  for (const row of rows) {
    const amount = signedBalance(row.normalBalance, row.debit, row.credit);
    if (row.accountType === "asset") assets = assets.plus(amount);
    if (row.accountType === "liability") liabilities = liabilities.plus(amount);
    if (row.accountType === "equity") equity = equity.plus(amount);
    if (row.accountType === "income") unclosed = unclosed.plus(amount);
    if (row.accountType === "expense") unclosed = unclosed.minus(amount);
  }
  const equityIncludingUnclosed = equity.plus(unclosed);
  const liabilitiesAndEquity = liabilities.plus(equityIncludingUnclosed);
  return {
    assets: money(assets),
    liabilities: money(liabilities),
    equity: money(equity),
    unclosedProfitOrLoss: money(unclosed),
    totalEquity: money(equityIncludingUnclosed),
    totalLiabilitiesAndEquity: money(liabilitiesAndEquity),
    balances: assets.eq(liabilitiesAndEquity),
  };
}

export function runningBalances(
  normalBalance: NormalBalance,
  openingSigned: string,
  lines: Array<{ debit: string; credit: string }>,
) {
  let running = decimal(openingSigned);
  const presented = lines.map((line) => {
    const movement = signedBalance(normalBalance, line.debit, line.credit);
    running = running.plus(movement);
    return { runningBalance: money(running) };
  });
  return { openingBalance: money(decimal(openingSigned)), lines: presented, closingBalance: money(running) };
}
