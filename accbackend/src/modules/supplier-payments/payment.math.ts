import { AppError } from "../../shared/errors";
import { decimal, money } from "../../shared/money";

export const SUPPLIER_ADVANCE_SETUP =
  "Set a supplier advance asset account in Purchasing settings before posting a payment that is not fully applied to bills.";

export type PaymentSplit = {
  applied: string;
  unapplied: string;
  treatment: "direct_ap" | "supplier_advance";
};

export function splitSupplierPayment(amount: string, allocated: string): PaymentSplit {
  const total = decimal(amount);
  const applied = decimal(allocated);
  if (total.lte(0)) throw new AppError(400, "VALIDATION", "The payment amount must be greater than zero.");
  if (applied.lt(0) || applied.gt(total)) {
    throw new AppError(409, "ALLOCATION", "Allocations cannot exceed the payment amount.");
  }
  const unapplied = total.minus(applied);
  return {
    applied: money(applied),
    unapplied: money(unapplied),
    treatment: unapplied.gt(0) ? "supplier_advance" : "direct_ap",
  };
}
