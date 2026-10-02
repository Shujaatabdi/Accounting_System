import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { partialReturnAmounts, priceInvoiceLine } from "../../src/modules/invoices/invoice.math";
import { decimal } from "../../src/shared/money";

describe("invoice line pricing", () => {
  it("adds exclusive tax after a line discount reduces the taxable base", () => {
    const priced = priceInvoiceLine({
      quantity: "2",
      unitPrice: "10",
      discountAmount: "1",
      taxRatePercent: "10",
      mode: "exclusive",
      treatment: "reduce_taxable_base",
      scale: 2,
    });
    assert.equal(priced.taxableBase, "19.0000");
    assert.equal(priced.taxAmount, "1.9000");
    assert.equal(priced.lineTotal, "20.9000");
  });

  it("extracts inclusive tax from the discounted gross", () => {
    const priced = priceInvoiceLine({
      quantity: "1",
      unitPrice: "110",
      discountAmount: "0",
      taxRatePercent: "10",
      mode: "inclusive",
      treatment: "reduce_taxable_base",
      scale: 2,
    });
    assert.equal(priced.taxAmount, "10.0000");
    assert.equal(priced.taxableBase, "100.0000");
    assert.equal(priced.lineTotal, "110.0000");
  });
});

describe("partial return rounding", () => {
  const original = {
    originalQuantity: "3",
    originalTaxableBase: "10.0000",
    originalTaxAmount: "1.0000",
    originalLineTotal: "11.0000",
  };

  it("gives the last slice the remaining snapshot so partials cannot exceed the line", () => {
    const first = partialReturnAmounts({
      ...original,
      returnedQuantity: "0",
      returnedTaxableBase: "0",
      returnedTaxAmount: "0",
      returnedLineTotal: "0",
      quantity: "1",
      scale: 2,
    });
    const second = partialReturnAmounts({
      ...original,
      returnedQuantity: "1",
      returnedTaxableBase: first.taxableBase,
      returnedTaxAmount: first.taxAmount,
      returnedLineTotal: first.lineTotal,
      quantity: "1",
      scale: 2,
    });
    const third = partialReturnAmounts({
      ...original,
      returnedQuantity: "2",
      returnedTaxableBase: decimal(first.taxableBase).plus(second.taxableBase).toFixed(4),
      returnedTaxAmount: decimal(first.taxAmount).plus(second.taxAmount).toFixed(4),
      returnedLineTotal: decimal(first.lineTotal).plus(second.lineTotal).toFixed(4),
      quantity: "1",
      scale: 2,
    });
    assert.equal(decimal(first.lineTotal).plus(second.lineTotal).plus(third.lineTotal).toFixed(4), "11.0000");
    assert.equal(decimal(first.taxAmount).plus(second.taxAmount).plus(third.taxAmount).toFixed(4), "1.0000");
    assert.ok(decimal(first.lineTotal).plus(second.lineTotal).lte("11.0000"));
  });

  it("rejects a quantity above the remainder", () => {
    assert.throws(
      () => partialReturnAmounts({
        ...original,
        returnedQuantity: "2",
        returnedTaxableBase: "6.6700",
        returnedTaxAmount: "0.6700",
        returnedLineTotal: "7.3400",
        quantity: "2",
        scale: 2,
      }),
      /quantity still available/,
    );
  });
});
