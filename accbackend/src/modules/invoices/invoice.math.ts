import Decimal from "decimal.js";
import { AppError } from "../../shared/errors";
import { decimal, money } from "../../shared/money";

export type TaxMode = "exclusive" | "inclusive";
export type DiscountTreatment = "reduce_taxable_base";

export type PricedLine = {
  taxableBase: string;
  taxAmount: string;
  lineTotal: string;
  discountAmount: string;
};

export type ReturnAmounts = {
  taxableBase: string;
  taxAmount: string;
  lineTotal: string;
};

export function priceInvoiceLine(input: {
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRatePercent: string;
  mode: TaxMode;
  treatment: DiscountTreatment;
  scale: number;
}): PricedLine {
  if (input.treatment !== "reduce_taxable_base") {
    throw new AppError(400, "VALIDATION", "That discount treatment is not configured.");
  }
  const quantity = decimal(input.quantity);
  const price = decimal(input.unitPrice);
  const discount = roundMoney(decimal(input.discountAmount), input.scale);
  const rate = decimal(input.taxRatePercent);
  if (quantity.lte(0) || price.lt(0) || discount.lt(0) || rate.lt(0) || rate.gt(100)) {
    throw new AppError(400, "VALIDATION", "Quantity, price, discount, and tax rate are not valid.");
  }
  const extended = roundMoney(quantity.mul(price), input.scale);
  if (discount.gt(extended)) {
    throw new AppError(400, "VALIDATION", "A line discount cannot exceed the extended price.");
  }
  const afterDiscount = extended.minus(discount);
  if (input.mode === "inclusive") {
    const divisor = rate.div(100).plus(1);
    const taxAmount = rate.isZero() ? new Decimal(0) : roundMoney(afterDiscount.minus(afterDiscount.div(divisor)), input.scale);
    const taxableBase = afterDiscount.minus(taxAmount);
    return amounts(taxableBase, taxAmount, afterDiscount, discount);
  }
  const taxableBase = afterDiscount;
  const taxAmount = roundMoney(taxableBase.mul(rate).div(100), input.scale);
  return amounts(taxableBase, taxAmount, taxableBase.plus(taxAmount), discount);
}

// Partial returns use the saved line amounts. The return that consumes the
// remaining quantity takes the remaining money so rounded slices cannot add
// up to more than the original line.
export function partialReturnAmounts(input: {
  originalQuantity: string;
  originalTaxableBase: string;
  originalTaxAmount: string;
  originalLineTotal: string;
  returnedQuantity: string;
  returnedTaxableBase: string;
  returnedTaxAmount: string;
  returnedLineTotal: string;
  quantity: string;
  scale: number;
}): ReturnAmounts {
  const originalQuantity = decimal(input.originalQuantity);
  const quantity = decimal(input.quantity);
  const returnedQuantity = decimal(input.returnedQuantity);
  if (quantity.lte(0)) throw new AppError(400, "VALIDATION", "Return quantity must be greater than zero.");
  const remainingQuantity = originalQuantity.minus(returnedQuantity);
  if (quantity.gt(remainingQuantity)) {
    throw new AppError(409, "RETURN_LIMIT", "The return exceeds the quantity still available on that invoice line.");
  }
  const taxableBase = allocate(input.originalTaxableBase, input.returnedTaxableBase, quantity, originalQuantity, remainingQuantity, input.scale);
  let taxAmount = allocate(input.originalTaxAmount, input.returnedTaxAmount, quantity, originalQuantity, remainingQuantity, input.scale);
  let lineTotal = taxableBase.plus(taxAmount);
  const remainingTotal = decimal(input.originalLineTotal).minus(decimal(input.returnedLineTotal));
  if (lineTotal.gt(remainingTotal)) {
    const excess = lineTotal.minus(remainingTotal);
    const taxReduction = Decimal.min(taxAmount, excess);
    taxAmount = taxAmount.minus(taxReduction);
    const stillOver = excess.minus(taxReduction);
    const base = taxableBase.minus(stillOver);
    if (base.lt(0) || taxAmount.lt(0)) {
      throw new AppError(409, "RETURN_LIMIT", "The return exceeds the value still available on that invoice line.");
    }
    lineTotal = base.plus(taxAmount);
    return {
      taxableBase: money(base),
      taxAmount: money(taxAmount),
      lineTotal: money(lineTotal),
    };
  }
  if (lineTotal.gt(remainingTotal)) {
    throw new AppError(409, "RETURN_LIMIT", "The return exceeds the value still available on that invoice line.");
  }
  return {
    taxableBase: money(taxableBase),
    taxAmount: money(taxAmount),
    lineTotal: money(lineTotal),
  };
}

function allocate(
  original: string,
  returned: string,
  quantity: Decimal,
  originalQuantity: Decimal,
  remainingQuantity: Decimal,
  scale: number,
): Decimal {
  const remaining = decimal(original).minus(decimal(returned));
  if (quantity.eq(remainingQuantity)) return remaining;
  const proportional = roundMoney(decimal(original).mul(quantity).div(originalQuantity), scale);
  return Decimal.min(proportional, remaining);
}

function roundMoney(value: Decimal, scale: number): Decimal {
  return value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

function amounts(taxableBase: Decimal, taxAmount: Decimal, lineTotal: Decimal, discount: Decimal): PricedLine {
  return {
    taxableBase: money(taxableBase),
    taxAmount: money(taxAmount),
    lineTotal: money(lineTotal),
    discountAmount: money(discount),
  };
}
