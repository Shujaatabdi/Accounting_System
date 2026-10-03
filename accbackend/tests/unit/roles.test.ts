import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_CODE_MESSAGE, roleCreateBody } from "../../src/modules/roles/roles.schemas";

const salesManager = [
  "accounting_profile.update", "accounting_profile.view", "accounts.create", "accounts.update", "accounts.view",
  "audit.view", "bills.approve", "bills.create", "bills.override_due_date", "bills.post", "bills.reverse",
  "bills.submit", "bills.update", "bills.view", "bills.void", "branches.create", "branches.update", "branches.view",
  "company.update", "company.view", "customer_returns.approve", "customer_returns.create",
  "customer_returns.create_unreferenced", "customer_returns.post", "customer_returns.reverse",
  "customer_returns.submit", "customer_returns.update", "customer_returns.view", "customer_returns.void",
  "customers.create", "customers.update", "customers.view", "invoices.approve", "invoices.create",
  "invoices.override_credit_limit", "invoices.override_due_date", "invoices.post", "invoices.reverse",
  "invoices.submit", "invoices.update", "invoices.view", "invoices.void", "journals.approve", "journals.create",
  "journals.post", "journals.reverse", "journals.submit", "journals.update", "users.create", "users.update",
];

test("role codes accept SmgrSale and reject spaces", () => {
  const saved = roleCreateBody.safeParse({ code: "SmgrSale", name: "Manager Sales", permissions: salesManager });
  assert.equal(saved.success, true);
  const spaced = roleCreateBody.safeParse({ code: "Bad Code", name: "Bad", permissions: [] });
  assert.equal(spaced.success, false);
  if (!spaced.success) {
    assert.equal(spaced.error.flatten().fieldErrors.code?.[0], ROLE_CODE_MESSAGE);
  }
});

test("unknown permission codes are named in the validation error", () => {
  const parsed = roleCreateBody.safeParse({ code: "bad_perm", name: "Bad", permissions: ["not.a.permission"] });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const message = parsed.error.flatten().fieldErrors.permissions?.[0] ?? "";
    assert.match(message, /not\.a\.permission/);
  }
});
