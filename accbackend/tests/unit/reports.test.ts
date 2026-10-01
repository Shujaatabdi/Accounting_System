import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalBalanceFor, presentBalanceSheet, presentProfitAndLoss, presentTrialBalance, runningBalances } from "../../src/modules/reports/calculations";

describe("report calculations", () => {
  it("maps normal balances from account type", () => {
    assert.equal(normalBalanceFor("asset"), "debit");
    assert.equal(normalBalanceFor("expense"), "debit");
    assert.equal(normalBalanceFor("income"), "credit");
    assert.equal(normalBalanceFor("liability"), "credit");
    assert.equal(normalBalanceFor("equity"), "credit");
  });

  it("presents a balanced trial balance", () => {
    const result = presentTrialBalance([
      { accountType: "asset", normalBalance: "debit", debit: "100.0000", credit: "25.0000" },
      { accountType: "equity", normalBalance: "credit", debit: "0.0000", credit: "75.0000" },
    ]);
    assert.equal(result.totalDebit, result.totalCredit);
    assert.equal(result.balances, true);
    assert.equal(result.rows[0].debitBalance, "75.0000");
  });

  it("computes profit and the balance-sheet equation with unclosed income", () => {
    const rows = [
      { accountType: "asset" as const, normalBalance: "debit" as const, debit: "100.0000", credit: "0" },
      { accountType: "income" as const, normalBalance: "credit" as const, debit: "0", credit: "100.0000" },
    ];
    const profit = presentProfitAndLoss(rows.filter((row) => row.accountType === "income"));
    assert.equal(profit.netIncome, "100.0000");
    const sheet = presentBalanceSheet(rows);
    assert.equal(sheet.assets, "100.0000");
    assert.equal(sheet.unclosedProfitOrLoss, "100.0000");
    assert.equal(sheet.balances, true);
  });

  it("does not double count income after it is closed into retained earnings", () => {
    const sheet = presentBalanceSheet([
      { accountType: "asset", normalBalance: "debit", debit: "100", credit: "0" },
      { accountType: "income", normalBalance: "credit", debit: "100", credit: "100" },
      { accountType: "equity", normalBalance: "credit", debit: "0", credit: "100" },
    ]);
    assert.equal(sheet.unclosedProfitOrLoss, "0.0000");
    assert.equal(sheet.equity, "100.0000");
    assert.equal(sheet.balances, true);
  });

  it("flags a statement that does not balance", () => {
    const sheet = presentBalanceSheet([
      { accountType: "asset", normalBalance: "debit", debit: "100", credit: "0" },
    ]);
    assert.equal(sheet.balances, false);
  });

  it("keeps a running general-ledger balance", () => {
    const ledger = runningBalances("debit", "10.0000", [
      { debit: "5.0000", credit: "0" },
      { debit: "0", credit: "3.0000" },
    ]);
    assert.equal(ledger.lines[1].runningBalance, "12.0000");
    assert.equal(ledger.closingBalance, "12.0000");
  });
});
