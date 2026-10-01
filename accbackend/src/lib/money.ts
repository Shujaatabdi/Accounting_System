import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function decimal(value: string | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export function money(value: Decimal): string {
  return value.toFixed(4);
}

export function isZero(value: Decimal): boolean {
  return value.isZero();
}
