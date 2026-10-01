import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decimal, money } from "../../src/lib/money";

describe("money", () => {
  it("adds decimal values without binary floating-point error", () => {
    assert.equal(money(decimal("0.10").plus("0.20")), "0.3000");
  });

  it("keeps four decimal places", () => {
    assert.equal(money(decimal("10")), "10.0000");
    assert.equal(money(decimal("1.5")), "1.5000");
  });
});
