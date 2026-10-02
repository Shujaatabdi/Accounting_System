import { AppError } from "../../shared/errors";
import { decimal, isZero } from "../../shared/money";
import type { Decimal } from "decimal.js";

const AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export type DraftLineInput = {
  accountId: string;
  branchId?: string | null;
  description?: string | null;
  debit: string;
  credit: string;
};

export type ParsedLine = {
  accountId: string;
  branchId: string | null;
  description: string | null;
  debit: Decimal;
  credit: Decimal;
};

export function parseJournalLines(lines: DraftLineInput[], scale: number): ParsedLine[] {
  if (lines.length < 1 || lines.length > 200) {
    throw new AppError(400, "VALIDATION", "A journal needs between 1 and 200 lines.");
  }
  if (!Number.isInteger(scale) || scale < 0 || scale > 4) {
    throw new AppError(400, "VALIDATION", "Currency decimal places must be from 0 to 4.");
  }
  return lines.map((line, index) => {
    const debit = parseAmount(line.debit, scale, index);
    const credit = parseAmount(line.credit, scale, index);
    if (debit.gt(0) && credit.gt(0)) {
      throw new AppError(400, "VALIDATION", `Line ${index + 1} cannot have both a debit and a credit.`);
    }
    if (isZero(debit) && isZero(credit)) {
      throw new AppError(400, "VALIDATION", `Line ${index + 1} needs a debit or a credit.`);
    }
    return {
      accountId: line.accountId,
      branchId: line.branchId ?? null,
      description: line.description?.trim() || null,
      debit,
      credit,
    };
  });
}

export function assertBalanced(lines: ParsedLine[]): { debit: Decimal; credit: Decimal } {
  if (lines.length < 2) {
    throw new AppError(400, "UNBALANCED", "A journal must have at least two lines before it can move forward.");
  }
  const debit = lines.reduce((sum, line) => sum.plus(line.debit), decimal("0"));
  const credit = lines.reduce((sum, line) => sum.plus(line.credit), decimal("0"));
  if (!debit.eq(credit) || debit.isZero()) {
    throw new AppError(400, "UNBALANCED", "Total debits must equal total credits and be greater than zero.");
  }
  return { debit, credit };
}

function parseAmount(value: string, scale: number, index: number): Decimal {
  if (!AMOUNT.test(value)) {
    throw new AppError(400, "VALIDATION", `Line ${index + 1} has an amount that is not a decimal string.`);
  }
  const amount = decimal(value);
  if (!amount.eq(decimal(amount.toFixed(scale)))) {
    throw new AppError(
      400,
      "VALIDATION",
      `Line ${index + 1} uses more decimal places than the company currency allows (${scale}).`,
    );
  }
  return amount;
}
