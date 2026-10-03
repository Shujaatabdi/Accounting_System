import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLE_CODE_PATTERN,
  groupCheckState,
  groupPermissions,
  selectAllPermissions,
  toggleGroup,
  validationLines,
} from "../../../accfrontend/src/features/roles/permission-groups";

const catalog = [
  { code: "company.view", module: "company", description: "View company" },
  { code: "company.update", module: "company", description: "Update company" },
  { code: "journals.view", module: "journals", description: "View journals" },
  { code: "journals.post", module: "journals", description: "Post journals" },
  { code: "invoices.view", module: "invoices", description: "View invoices" },
  { code: "bills.view", module: "bills", description: "View bills" },
  { code: "reports.view", module: "reports", description: "View reports" },
];

test("role code pattern accepts SmgrSale", () => {
  assert.equal(ROLE_CODE_PATTERN.test("SmgrSale"), true);
  assert.equal(ROLE_CODE_PATTERN.test("Bad Code"), false);
});

test("permission groups keep every catalog permission", () => {
  const groups = groupPermissions(catalog);
  const codes = groups.flatMap((group) => group.permissions.map((permission) => permission.code));
  assert.deepEqual(codes.sort(), catalog.map((item) => item.code).sort());
  assert.deepEqual(groups.map((group) => group.label), ["Setup", "Ledger", "Sales", "Purchasing", "Reports"]);
});

test("page and group controls select and clear the intended permissions", () => {
  const all = selectAllPermissions(catalog);
  assert.deepEqual(all, catalog.map((item) => item.code));
  const ledger = ["journals.view", "journals.post"];
  const withLedger = toggleGroup([], ledger);
  assert.deepEqual(withLedger, ledger);
  const withSales = toggleGroup(withLedger, ["invoices.view"]);
  assert.deepEqual(toggleGroup(withSales, ledger), ["invoices.view"]);
  assert.equal(groupCheckState(["journals.view"], ledger), "some");
  assert.equal(groupCheckState(ledger, ledger), "all");
  assert.equal(groupCheckState([], ledger), "none");
});

test("loading a saved role checks exactly its permissions", () => {
  const saved = ["company.view", "company.update", "journals.view"];
  const setup = ["company.view", "company.update"];
  assert.equal(groupCheckState(saved, setup), "all");
  assert.equal(groupCheckState(saved, ["journals.view", "journals.post"]), "some");
  assert.equal(saved.includes("journals.post"), false);
});

test("validation details name the field instead of hiding behind a generic message", () => {
  const lines = validationLines("Request validation failed.", {
    fieldErrors: { code: ["Role code can use letters, digits, and underscores only, up to 40 characters."] },
  });
  assert.deepEqual(lines, ["Code: Role code can use letters, digits, and underscores only, up to 40 characters."]);
});
