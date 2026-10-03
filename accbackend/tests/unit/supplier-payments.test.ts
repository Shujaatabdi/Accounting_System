import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitSupplierPayment } from "../../src/modules/supplier-payments/payment.math";

describe("supplier payment split", () => {
  it("applies a fully allocated payment directly to accounts payable", () => {
    assert.deepEqual(splitSupplierPayment("22.00", "22.00"), {
      applied: "22.0000",
      unapplied: "0.0000",
      treatment: "direct_ap",
    });
  });

  it("keeps an unapplied remainder for the supplier advance asset", () => {
    assert.deepEqual(splitSupplierPayment("30.00", "12.00"), {
      applied: "12.0000",
      unapplied: "18.0000",
      treatment: "supplier_advance",
    });
  });

  it("rejects an allocation above the payment", () => {
    assert.throws(() => splitSupplierPayment("10.00", "10.01"), /cannot exceed/);
  });
});
