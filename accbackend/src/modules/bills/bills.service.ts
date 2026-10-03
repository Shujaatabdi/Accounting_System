import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { addDays, assertIsoDate } from "../../shared/dates";
import { AppError, one } from "../../shared/errors";
import { decimal, money } from "../../shared/money";
import { pageResult, type Page } from "../../shared/http/pagination";
import type { AuthUser, RequestMeta } from "../auth/auth.types";
import { selectCurrencyScale, selectRequireDistinctApprover } from "../company/company.repository";
import { allocateNumber } from "../company/numbering.service";
import { selectPurchasingSettings } from "../company/purchasing.repository";
import { assertMappedPurchaseTaxAccount } from "../company/tax.service";
import { displayCnicNtn } from "../customers/customer-tax";
import {
  allowSystemPost,
  insertReversalLines,
  lockEntryLines,
  markPosted,
  markReversedBy,
  openPeriodId,
  postSystemJournal,
} from "../ledger/ledger.service";
import { insertReversalJournal } from "../journals/journals.repository";
import { priceInvoiceLine, type DiscountTreatment, type TaxMode } from "../invoices/invoice.math";
import {
  activeBillDependencies,
  countBills,
  insertBill,
  lockSupplierTaxProfile,
  replaceBillLines,
  selectAccountType,
  selectBill,
  selectBillLines,
  selectBills,
  selectBranch,
  selectProductForBill,
  selectSupplierForBill,
  selectTaxCode,
  selectUnitFactor,
  setBillStatus,
  setBillTaxSnapshot,
  updateBill,
} from "./bills.repository";
import type { billBody } from "./bills.schemas";
import type { z } from "zod";

type BillInput = z.infer<typeof billBody>;
type Decimal = ReturnType<typeof decimal>;

export async function listBills(actor: AuthUser, page: Page, filters: { search?: string; status?: string; supplierId?: string }) {
  const params: unknown[] = [];
  const where = ["TRUE"];
  applyBranch(actor, where, params, "b.branch_id");
  if (filters.status) {
    params.push(filters.status);
    where.push(`b.status = $${params.length}`);
  }
  if (filters.supplierId) {
    params.push(filters.supplierId);
    where.push(`b.supplier_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(b.bill_number ILIKE $${params.length} OR s.display_name ILIKE $${params.length})`);
  }
  const clause = where.join(" AND ");
  const total = Number(one((await countBills({ query }, clause, params)).rows).count);
  params.push(page.pageSize, page.offset);
  const rows = await selectBills({ query }, clause, params);
  return pageResult(rows.rows.map(mapHeader), total, page);
}

export async function getBill(id: string, actor: AuthUser) {
  return load({ query }, id, actor, false);
}

export async function createBill(input: BillInput, meta: RequestMeta) {
  assertIsoDate(input.billDate);
  return withTransaction(async (client) => {
    const built = await build(client, input, meta);
    const number = await allocateNumber(client, "bill");
    const row = one((await insertBill(client, [
      number, input.supplierId, input.branchId, input.billDate, built.dueDate, built.terms, built.overridden,
      built.mode, built.treatment, input.notes ?? null, built.taxable, built.tax, built.total, meta.actor.id,
    ])).rows);
    await replaceBillLines(client, row.id, built.lines);
    const saved = await load(client, row.id, meta.actor, false);
    await audit(client, meta, "bills.create", row.id, `Created ${number}`, null, saved);
    if (built.overridden) await audit(client, meta, "bills.override_due_date", row.id, "Due date differs from the payment terms", null, { dueDate: built.dueDate, paymentTermsDays: built.terms });
    return saved;
  });
}

export async function updateBillDraft(id: string, input: BillInput, meta: RequestMeta) {
  assertIsoDate(input.billDate);
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (!["draft", "rejected"].includes(current.status)) throw new AppError(409, "BILL_STATE", "Only a draft or rejected bill can be edited.");
    const built = await build(client, input, meta);
    await updateBill(client, id, [
      input.supplierId, input.branchId, input.billDate, built.dueDate, built.terms, built.overridden,
      built.mode, built.treatment, input.notes ?? null, built.taxable, built.tax, built.total,
    ]);
    await replaceBillLines(client, id, built.lines);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "bills.update", id, `Updated ${saved.billNumber}`, current, saved);
    return saved;
  });
}

export async function submitBill(id: string, meta: RequestMeta) {
  return transition(id, meta, "draft", "submitted", "submitted_at = now(), submitted_by = $2", "bills.submit");
}

export async function rejectBill(id: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "submitted") throw new AppError(409, "BILL_STATE", "Only a submitted bill can be rejected.");
    await setBillStatus(client, id, "status = 'rejected'", []);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "bills.reject", id, reason, current, saved);
    return saved;
  });
}

export async function approveBill(id: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "submitted") throw new AppError(409, "BILL_STATE", "Only a submitted bill can be approved.");
    const company = one((await selectRequireDistinctApprover(client)).rows);
    if (company.require_distinct_approver && current.submittedBy === meta.actor.id) {
      throw new AppError(403, "SEPARATION", "A different person must approve this bill.");
    }
    await setBillStatus(client, id, "status = 'approved', approved_at = now(), approved_by = $2", [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "bills.approve", id, `Approved ${saved.billNumber}`, current, saved);
    return saved;
  });
}

export async function postBill(id: string, input: { postingDate?: string }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "approved") throw new AppError(409, "BILL_STATE", "Only an approved bill can be posted.");
    const postingDate = input.postingDate ?? current.billDate;
    assertIsoDate(postingDate);
    const settings = one((await selectPurchasingSettings(client)).rows);
    if (!settings.ap_control_account_id) {
      throw new AppError(409, "AP_CONTROL", "Choose the payable control account in Purchasing settings before posting a supplier bill.");
    }
    const purchases = new Map<string, Decimal>();
    const taxes = new Map<string, Decimal>();
    for (const line of current.lines) {
      await assertExpenseAccount(client, line.purchaseAccountId);
      addMap(purchases, line.purchaseAccountId, line.taxableBase);
      if (decimal(line.taxRate).gt(0) || decimal(line.taxAmount).gt(0)) {
        await assertMappedPurchaseTaxAccount(client, line.taxAccountId, true);
        if (decimal(line.taxAmount).gt(0) && line.taxAccountId) addMap(taxes, line.taxAccountId, line.taxAmount);
      }
    }
    const journalId = await postSystemJournal(client, {
      entryNumber: await allocateNumber(client, "journal"),
      entryDate: postingDate,
      description: `Supplier bill ${current.billNumber}`,
      reference: current.billNumber,
      sourceType: "supplier_bill",
      sourceId: id,
      createdBy: meta.actor.id,
      lines: [
        ...[...purchases].map(([accountId, amount]) => ({ accountId, branchId: current.branchId, description: current.billNumber, debit: money(amount), credit: "0" })),
        ...[...taxes].map(([accountId, amount]) => ({ accountId, branchId: current.branchId, description: current.billNumber, debit: money(amount), credit: "0" })),
        { accountId: settings.ap_control_account_id, branchId: current.branchId, description: current.billNumber, debit: "0", credit: current.total },
      ],
    });
    const profile = one((await lockSupplierTaxProfile(client, current.supplierId)).rows, "Supplier not found.");
    await setBillTaxSnapshot(client, id, supplierTaxSnapshot(settings.show_supplier_tax_identifiers, profile));
    await setBillStatus(client, id, "status = 'posted', journal_entry_id = $2, posted_at = now(), posted_by = $3", [journalId, meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "bills.post", id, `Posted ${saved.billNumber}`, current, saved);
    return saved;
  });
}

export async function voidBill(id: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (!["draft", "submitted", "approved", "rejected"].includes(current.status)) {
      throw new AppError(409, "BILL_STATE", "A posted bill cannot be voided. Reverse it after its payments and returns are cleared.");
    }
    await setBillStatus(client, id, "status = 'void', voided_at = now(), voided_by = $2", [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "bills.void", id, reason, current, saved);
    return saved;
  });
}

export async function reverseBill(id: string, input: { reason: string; postingDate?: string }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "posted" || !current.journalEntryId) {
      throw new AppError(409, "BILL_STATE", "Only a posted bill can be reversed.");
    }
    const dependents = await activeBillDependencies(client, id);
    if ((dependents.rowCount ?? 0) > 0) {
      throw new AppError(409, "BILL_DEPENDENTS", "Unallocate payments and reverse posted returns before reversing this bill.");
    }
    const postingDate = input.postingDate ?? current.billDate;
    assertIsoDate(postingDate);
    const periodId = await openPeriodId(client, postingDate);
    const lines = await lockEntryLines(client, current.journalEntryId);
    const reversal = one((await insertReversalJournal(client, [
      await allocateNumber(client, "journal"),
      postingDate,
      `Reversal of supplier bill ${current.billNumber}: ${input.reason}`,
      current.billNumber,
      current.journalEntryId,
      meta.actor.id,
    ])).rows);
    await insertReversalLines(client, reversal.id, lines);
    await allowSystemPost(client);
    await markPosted(client, reversal.id, postingDate, periodId, meta.actor.id);
    await markReversedBy(client, current.journalEntryId, reversal.id);
    await setBillStatus(client, id, "status = 'reversed'", []);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "bills.reverse", id, input.reason, current, saved);
    return saved;
  });
}

async function build(db: Sql, input: BillInput, meta: RequestMeta) {
  assertBranch(meta.actor, input.branchId);
  const branch = one((await selectBranch(db, input.branchId)).rows, "Branch not found.");
  if (!branch.is_active) throw new AppError(400, "VALIDATION", "The branch is inactive.");
  const supplier = one((await selectSupplierForBill(db, input.supplierId)).rows, "Supplier not found.");
  if (!supplier.is_active) throw new AppError(400, "VALIDATION", "The supplier is inactive.");
  const settings = one((await selectPurchasingSettings(db)).rows);
  const scale = one((await selectCurrencyScale(db)).rows).currency_decimal_places;
  const terms = input.paymentTermsDays ?? supplier.payment_terms_days;
  const calculatedDue = addDays(input.billDate, terms);
  const dueDate = input.dueDate ?? calculatedDue;
  assertIsoDate(dueDate);
  const overridden = dueDate !== calculatedDue;
  if (overridden && !allowed(meta.actor, "bills.override_due_date")) {
    throw new AppError(403, "FORBIDDEN", "Changing the due date from the payment terms requires permission.");
  }
  const lines = [];
  let taxable = decimal("0");
  let tax = decimal("0");
  let total = decimal("0");
  for (const [index, line] of input.lines.entries()) {
    const product = one((await selectProductForBill(db, line.productId)).rows, "Product not found.");
    if (!product.is_active) throw new AppError(400, "VALIDATION", "The product is inactive.");
    if (!product.purchase_account_id) {
      throw new AppError(400, "PURCHASE_ACCOUNT", `Set a purchase expense account on ${product.sku} before using it on a supplier bill.`);
    }
    await assertExpenseAccount(db, product.purchase_account_id);
    let factor = "1.000000";
    if (line.unitId) {
      const unit = one((await selectUnitFactor(db, product.id, line.unitId)).rows, "That unit is not set on the product.");
      factor = unit.factor;
    }
    const taxCodeId = line.taxCodeId === undefined ? product.tax_code_id : line.taxCodeId ?? null;
    let rate = "0";
    let taxAccount: string | null = null;
    if (taxCodeId) {
      const taxCode = one((await selectTaxCode(db, taxCodeId)).rows, "Tax code not found.");
      if (!taxCode.is_active || taxCode.effective_from > input.billDate || (taxCode.effective_to && taxCode.effective_to < input.billDate)) {
        throw new AppError(400, "VALIDATION", "The tax code is not effective on the bill date.");
      }
      rate = taxCode.rate_percent;
      taxAccount = taxCode.purchase_account_id;
      await assertMappedPurchaseTaxAccount(db, taxAccount, decimal(rate).gt(0));
    }
    const priced = priceInvoiceLine({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount ?? "0",
      taxRatePercent: rate,
      mode: settings.tax_pricing_mode,
      treatment: settings.discount_treatment,
      scale,
    });
    taxable = taxable.plus(priced.taxableBase);
    tax = tax.plus(priced.taxAmount);
    total = total.plus(priced.lineTotal);
    lines.push([
      index + 1, product.id, line.description?.trim() || product.name, money(line.quantity), line.unitId ?? null, factor, money(line.unitPrice),
      priced.discountAmount, settings.discount_treatment, taxCodeId, settings.tax_pricing_mode, rate,
      priced.taxableBase, priced.taxAmount, priced.lineTotal, product.purchase_account_id, taxAccount,
    ]);
  }
  return { dueDate, terms, overridden, mode: settings.tax_pricing_mode as TaxMode, treatment: settings.discount_treatment as DiscountTreatment, taxable: money(taxable), tax: money(tax), total: money(total), lines };
}

async function assertExpenseAccount(db: Sql, accountId: string) {
  const account = one((await selectAccountType(db, accountId)).rows, "Account not found.");
  if (!account.is_active || account.is_header || account.account_type !== "expense") {
    throw new AppError(400, "PURCHASE_ACCOUNT", "A supplier bill line must use an active expense account. Purchases are not posted to an inventory asset.");
  }
}

async function transition(id: string, meta: RequestMeta, from: string, to: string, sql: string, action: string) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== from) throw new AppError(409, "BILL_STATE", `The bill must be ${from}.`);
    await setBillStatus(client, id, `status = '${to}', ${sql}`, [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, action, id, `${action} ${saved.billNumber}`, current, saved);
    return saved;
  });
}

async function load(db: Sql, id: string, actor: AuthUser, lock: boolean) {
  const row = one((await selectBill(db, id, lock)).rows, "Supplier bill not found.");
  if (actor.branchIds && !actor.branchIds.includes(row.branch_id)) throw new AppError(404, "NOT_FOUND", "Supplier bill not found.");
  const lines = await selectBillLines(db, id);
  const settings = one((await selectPurchasingSettings(db)).rows);
  return {
    ...mapHeader(row),
    lines: lines.rows.map(mapLine),
    supplierTaxIdentifiers: supplierTaxDisplay(row, settings.show_supplier_tax_identifiers),
  };
}

function mapHeader(row: {
  id: string; bill_number: string; supplier_id: string; supplier_name: string; branch_id: string; status: string;
  bill_date: string; due_date: string; payment_terms_days: number; due_date_overridden: boolean;
  tax_pricing_mode: string; discount_treatment: string; notes: string | null; taxable_total: string; tax_total: string;
  total: string; journal_entry_id: string | null; created_by: string; submitted_by: string | null; approved_by: string | null; posted_by: string | null;
}) {
  return {
    id: row.id,
    billNumber: row.bill_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    branchId: row.branch_id,
    status: row.status,
    billDate: row.bill_date,
    dueDate: row.due_date,
    paymentTermsDays: row.payment_terms_days,
    dueDateOverridden: row.due_date_overridden,
    taxPricingMode: row.tax_pricing_mode,
    discountTreatment: row.discount_treatment,
    notes: row.notes,
    taxableTotal: row.taxable_total,
    taxTotal: row.tax_total,
    total: row.total,
    journalEntryId: row.journal_entry_id,
    createdBy: row.created_by,
    submittedBy: row.submitted_by,
    approvedBy: row.approved_by,
    postedBy: row.posted_by,
  };
}

function mapLine(row: {
  id: string; line_no: number; product_id: string | null; description: string; quantity: string; unit_id: string | null;
  unit_price: string; discount_amount: string; tax_code_id: string | null; tax_pricing_mode: string; tax_rate: string;
  taxable_base: string; tax_amount: string; line_total: string; purchase_account_id: string; tax_account_id: string | null;
}) {
  return {
    id: row.id, lineNo: row.line_no, productId: row.product_id, description: row.description, quantity: row.quantity,
    unitId: row.unit_id, unitPrice: row.unit_price, discountAmount: row.discount_amount, taxCodeId: row.tax_code_id,
    taxPricingMode: row.tax_pricing_mode, taxRate: row.tax_rate, taxableBase: row.taxable_base, taxAmount: row.tax_amount,
    lineTotal: row.line_total, purchaseAccountId: row.purchase_account_id, taxAccountId: row.tax_account_id,
  };
}

function supplierTaxSnapshot(show: boolean, profile: {
  tax_country_code: string | null;
  tax_identifier: string | null;
  party_type: string | null;
  cnic_ntn: string | null;
  ntn_check_digit: string | null;
  strn: string | null;
}) {
  if (!show) return [null, null, null, null, null, null];
  return [profile.tax_country_code, profile.tax_identifier, profile.party_type, profile.cnic_ntn, profile.ntn_check_digit, profile.strn];
}

function supplierTaxDisplay(row: {
  snapshot_tax_country_code?: string | null;
  snapshot_tax_identifier?: string | null;
  snapshot_party_type?: string | null;
  snapshot_cnic_ntn?: string | null;
  snapshot_ntn_check_digit?: string | null;
  snapshot_strn?: string | null;
}, show: boolean) {
  if (!show) return null;
  const cnicNtn = displayCnicNtn(row.snapshot_party_type ?? null, row.snapshot_cnic_ntn ?? null, row.snapshot_ntn_check_digit ?? null);
  if (!row.snapshot_tax_country_code && !row.snapshot_tax_identifier && !row.snapshot_party_type && !cnicNtn && !row.snapshot_strn) return null;
  return {
    taxCountryCode: row.snapshot_tax_country_code ?? null,
    taxIdentifier: row.snapshot_tax_identifier ?? null,
    partyType: row.snapshot_party_type ?? null,
    cnicNtn,
    strn: row.snapshot_strn ?? null,
  };
}

function addMap(target: Map<string, Decimal>, key: string, amount: string) {
  target.set(key, (target.get(key) ?? decimal("0")).plus(decimal(amount)));
}

function applyBranch(actor: AuthUser, where: string[], params: unknown[], column: string) {
  if (!actor.branchIds) return;
  params.push(actor.branchIds);
  where.push(`${column} = ANY($${params.length}::uuid[])`);
}

function assertBranch(actor: AuthUser, branchId: string) {
  if (actor.branchIds && !actor.branchIds.includes(branchId)) throw new AppError(403, "BRANCH_SCOPE", "That branch is outside your access.");
}

function allowed(actor: AuthUser, permission: string) {
  return actor.isCompanyAdmin || actor.permissions.includes(permission);
}

function audit(db: Sql, meta: RequestMeta, action: string, id: string, summary: string, before: unknown, after: unknown) {
  return writeAudit(db, {
    actorUserId: meta.actor.id, action, entityType: "supplier_bill", entityId: id, summary, before, after,
    ipAddress: meta.ipAddress, requestId: meta.requestId,
  });
}
