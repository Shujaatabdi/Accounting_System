import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayCnicNtn, parseCnicNtn } from "../../src/modules/customers/customer-tax";

describe("customer tax identifiers", () => {
  it("stores an individual CNIC as 13 digits", () => {
    assert.deepEqual(parseCnicNtn("individual", "35202-1234567-1"), {
      canonical: "3520212345671",
      ntnCheckDigit: null,
    });
  });

  it("stores a seven-digit NTN and a printed check digit separately", () => {
    assert.deepEqual(parseCnicNtn("company", "1234567"), {
      canonical: "1234567",
      ntnCheckDigit: null,
    });
    assert.deepEqual(parseCnicNtn("aop", "1234567-8"), {
      canonical: "1234567",
      ntnCheckDigit: "8",
    });
    assert.equal(displayCnicNtn("aop", "1234567", "8"), "1234567-8");
    assert.equal(displayCnicNtn("company", "1234567", null), "1234567");
  });

  it("rejects an eighth digit that is not written as a check digit", () => {
    assert.throws(() => parseCnicNtn("company", "12345678"), /7 digits/);
  });
});
