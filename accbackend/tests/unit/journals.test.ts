import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../src/shared/errors";
import { assertBalanced, parseJournalLines } from "../../src/modules/journals/journals.validation";

const line = (debit: string, credit: string) => ({
  accountId: "10000000-0000-4000-8000-000000000001",
  debit,
  credit,
});

describe("journal lines", () => {
  it("accepts a balanced entry at the company scale", () => {
    const lines = parseJournalLines([line("10.50", "0"), line("0.00", "10.50")], 2);
    const totals = assertBalanced(lines);
    assert.equal(totals.debit.toFixed(2), "10.50");
    assert.equal(totals.credit.toFixed(2), "10.50");
  });

  it("accepts stored numeric scale that does not change the currency amount", () => {
    const lines = parseJournalLines([line("10.5000", "0.0000"), line("0.0000", "10.5000")], 2);
    assert.equal(assertBalanced(lines).debit.toFixed(4), "10.5000");
  });

  it("rejects an unbalanced entry", () => {
    const lines = parseJournalLines([line("10.00", "0"), line("0", "9.00")], 2);
    assert.throws(() => assertBalanced(lines), (error: unknown) => error instanceof AppError && error.code === "UNBALANCED");
  });

  it("rejects a line with both a debit and a credit", () => {
    assert.throws(
      () => parseJournalLines([line("5", "5")], 2),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION",
    );
  });

  it("rejects a zero line and extra precision", () => {
    assert.throws(() => parseJournalLines([line("0", "0")], 2), AppError);
    assert.throws(() => parseJournalLines([line("1.001", "0")], 2), AppError);
  });

  it("rejects fewer than two lines when balancing", () => {
    const lines = parseJournalLines([line("10", "0")], 2);
    assert.throws(() => assertBalanced(lines), (error: unknown) => error instanceof AppError && error.code === "UNBALANCED");
  });
});
