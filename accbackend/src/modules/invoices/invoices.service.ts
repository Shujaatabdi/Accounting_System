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
import { selectSalesSettings } from "../company/sales.repository";
import { selectExposure } from "../customers/customers.repository";
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
import { priceInvoiceLine, type DiscountTreatment, type TaxMode } from "./invoice.math";
import {
  activeInvoiceDependencies,
  countInvoices,
  insertInvoice,
  replaceInvoiceLines,
  selectBranch,
  selectCustomerForSale,
  selectInvoice,
  selectInvoiceLines,
  selectInvoices,
  selectProductForSale,
  selectTaxCode,
  selectUnitFactor,
  setInvoiceStatus,
  updateInvoice,
} from "./invoices.repository";

type InvoiceInput = {
  customerId: string;
  branchId: string;
  invoiceDate: string;
  dueDate?: string;
  paymentTermsDays?: number;
  notes?: string | null;
  lines: Array<{
    productId: string;
    description?: string;
    quantity: string;
    unitId?: string | null;
    unitPrice: string;
    discountAmount?: string;
    taxCodeId?: string | null;
  }>;
};

export async function listInvoices(actor: AuthUser, page: Page, filters: { search?: string; status?: string; customerId?: string }) {
  const params: unknown[] = [];
  const where = ["TRUE"];
  applyBranch(actor, where, params, "i.branch_id");
  if (filters.status) {
    params.push(filters.status);
    where.push(`i.status = $${params.length}`);
  }
  if (filters.customerId) {
    params.push(filters.customerId);
    where.push(`i.customer_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(i.invoice_number ILIKE $${params.length} OR c.display_name ILIKE $${params.length})`);
  }
  const clause = where.join(" AND ");
  const total = Number(one((await countInvoices({ query }, clause, params)).rows).count);
  params.push(page.pageSize, page.offset);
  const rows = await selectInvoices({ query }, clause, params);
  return pageResult(rows.rows.map(mapHeader), total, page);
}

export async function getInvoice(id: string, actor: AuthUser) {
  return load({ query }, id, actor, false);
}

export async function createInvoice(input: InvoiceInput, meta: RequestMeta) {
  assertIsoDate(input.invoiceDate);
  return withTransaction(async (client) => {
    const built = await build(client, input, meta);
    const number = await allocateNumber(client, "invoice");
    const row = one((await insertInvoice(client, [
      number, input.customerId, input.branchId, input.invoiceDate, built.dueDate, built.terms, built.overridden,
      built.mode, built.treatment, input.notes ?? null, built.taxable, built.tax, built.total, meta.actor.id,
    ])).rows);
    await replaceInvoiceLines(client, row.id, built.lines);
    const saved = await load(client, row.id, meta.actor, false);
    await audit(client, meta, "invoices.create", row.id, `Created ${number}`, null, saved);
    if (built.overridden) await audit(client, meta, "invoices.override_due_date", row.id, "Due date differs from the payment terms", null, { dueDate: built.dueDate, paymentTermsDays: built.terms });
    return saved;
  });
}

export async function updateInvoiceDraft(id: string, input: InvoiceInput, meta: RequestMeta) {
  assertIsoDate(input.invoiceDate);
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (!["draft", "rejected"].includes(current.status)) throw new AppError(409, "INVOICE_STATE", "Only a draft or rejected invoice can be edited.");
    const built = await build(client, input, meta);
    await updateInvoice(client, id, [
      input.customerId, input.branchId, input.invoiceDate, built.dueDate, built.terms, built.overridden,
      built.mode, built.treatment, input.notes ?? null, built.taxable, built.tax, built.total,
    ]);
    await replaceInvoiceLines(client, id, built.lines);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "invoices.update", id, `Updated ${saved.invoiceNumber}`, current, saved);
    return saved;
  });
}

export async function submitInvoice(id: string, meta: RequestMeta) {
  return transition(id, meta, "draft", "submitted", "submitted_at = now(), submitted_by = $2", "invoices.submit");
}

export async function rejectInvoice(id: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "submitted") throw new AppError(409, "INVOICE_STATE", "Only a submitted invoice can be rejected.");
    await setInvoiceStatus(client, id, "status = 'rejected'", []);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "invoices.reject", id, reason, current, saved);
    return saved;
  });
}

export async function approveInvoice(id: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "submitted") throw new AppError(409, "INVOICE_STATE", "Only a submitted invoice can be approved.");
    const company = one((await selectRequireDistinctApprover(client)).rows);
    if (company.require_distinct_approver && current.submittedBy === meta.actor.id) {
      throw new AppError(403, "SEPARATION", "A different person must approve this invoice.");
    }
    await setInvoiceStatus(client, id, "status = 'approved', approved_at = now(), approved_by = $2", [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "invoices.approve", id, `Approved ${saved.invoiceNumber}`, current, saved);
    return saved;
  });
}

export async function postInvoice(id: string, input: { postingDate?: string; overrideCreditLimit?: boolean }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "approved") throw new AppError(409, "INVOICE_STATE", "Only an approved invoice can be posted.");
    const postingDate = input.postingDate ?? current.invoiceDate;
    assertIsoDate(postingDate);
    await assertCredit(client, current.customerId, current.total, Boolean(input.overrideCreditLimit), meta);
    const settings = one((await selectSalesSettings(client)).rows);
    if (!settings.ar_control_account_id) throw new AppError(409, "AR_CONTROL", "Choose the receivable control account before posting an invoice.");
    const sales = new Map<string, Decimal>();
    const taxes = new Map<string, Decimal>();
    for (const line of current.lines) {
      addMap(sales, line.salesAccountId, line.taxableBase);
      if (decimal(line.taxAmount).gt(0)) {
        if (!line.taxAccountId) throw new AppError(409, "TAX_ACCOUNT", "A taxed line needs the tax code sales account that was saved on the invoice.");
        addMap(taxes, line.taxAccountId, line.taxAmount);
      }
    }
    const journalId = await postSystemJournal(client, {
      entryNumber: await allocateNumber(client, "journal"),
      entryDate: postingDate,
      description: `Invoice ${current.invoiceNumber}`,
      reference: current.invoiceNumber,
      sourceType: "invoice",
      sourceId: id,
      createdBy: meta.actor.id,
      lines: [
        { accountId: settings.ar_control_account_id, branchId: current.branchId, description: current.invoiceNumber, debit: current.total, credit: "0" },
        ...[...sales].map(([accountId, amount]) => ({ accountId, branchId: current.branchId, description: current.invoiceNumber, debit: "0", credit: money(amount) })),
        ...[...taxes].map(([accountId, amount]) => ({ accountId, branchId: current.branchId, description: current.invoiceNumber, debit: "0", credit: money(amount) })),
      ],
    });
    await setInvoiceStatus(client, id, "status = 'posted', journal_entry_id = $2, posted_at = now(), posted_by = $3", [journalId, meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "invoices.post", id, `Posted ${saved.invoiceNumber}`, current, saved);
    return saved;
  });
}

export async function voidInvoice(id: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (!["draft", "submitted", "approved", "rejected"].includes(current.status)) {
      throw new AppError(409, "INVOICE_STATE", "A posted invoice cannot be voided. Reverse it after its receipts and returns are cleared.");
    }
    await setInvoiceStatus(client, id, "status = 'void', voided_at = now(), voided_by = $2", [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "invoices.void", id, reason, current, saved);
    return saved;
  });
}

export async function reverseInvoice(id: string, input: { reason: string; postingDate?: string }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "posted" || !current.journalEntryId) {
      throw new AppError(409, "INVOICE_STATE", "Only a posted invoice can be reversed.");
    }
    const dependents = await activeInvoiceDependencies(client, id);
    if ((dependents.rowCount ?? 0) > 0) {
      throw new AppError(409, "INVOICE_DEPENDENTS", "Unallocate receipts and reverse posted returns before reversing this invoice.");
    }
    const postingDate = input.postingDate ?? current.invoiceDate;
    assertIsoDate(postingDate);
    const periodId = await openPeriodId(client, postingDate);
    const lines = await lockEntryLines(client, current.journalEntryId);
    const reversal = one((await insertReversalJournal(client, [
      await allocateNumber(client, "journal"),
      postingDate,
      `Reversal of invoice ${current.invoiceNumber}: ${input.reason}`,
      current.invoiceNumber,
      current.journalEntryId,
      meta.actor.id,
    ])).rows);
    await insertReversalLines(client, reversal.id, lines);
    await allowSystemPost(client);
    await markPosted(client, reversal.id, postingDate, periodId, meta.actor.id);
    await markReversedBy(client, current.journalEntryId, reversal.id);
    await setInvoiceStatus(client, id, "status = 'reversed'", []);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "invoices.reverse", id, input.reason, current, saved);
    return saved;
  });
}

async function build(db: Sql, input: InvoiceInput, meta: RequestMeta) {
  assertBranch(meta.actor, input.branchId);
  const branch = one((await selectBranch(db, input.branchId)).rows, "Branch not found.");
  if (!branch.is_active) throw new AppError(400, "VALIDATION", "The branch is inactive.");
  const customer = one((await selectCustomerForSale(db, input.customerId)).rows, "Customer not found.");
  if (!customer.is_active) throw new AppError(400, "VALIDATION", "The customer is inactive.");
  const settings = one((await selectSalesSettings(db)).rows);
  const scale = one((await selectCurrencyScale(db)).rows).currency_decimal_places;
  const terms = input.paymentTermsDays ?? customer.payment_terms_days;
  const calculatedDue = addDays(input.invoiceDate, terms);
  const dueDate = input.dueDate ?? calculatedDue;
  assertIsoDate(dueDate);
  const overridden = dueDate !== calculatedDue;
  if (overridden && !allowed(meta.actor, "invoices.override_due_date")) {
    throw new AppError(403, "FORBIDDEN", "Changing the due date from the payment terms requires permission.");
  }
  const lines = [];
  let taxable = decimal("0");
  let tax = decimal("0");
  let total = decimal("0");
  for (const [index, line] of input.lines.entries()) {
    const product = one((await selectProductForSale(db, line.productId)).rows, "Product not found.");
    if (!product.is_active || !product.sales_account_id) throw new AppError(400, "VALIDATION", "Each line needs an active product with a sales account.");
    let factor = "1.000000";
    if (line.unitId) {
      const unit = one((await selectUnitFactor(db, product.id, line.unitId)).rows, "That unit is not set on the product.");
      factor = unit.factor;
    }
    const taxCodeId = line.taxCodeId ?? null;
    let rate = "0";
    let taxAccount: string | null = null;
    if (taxCodeId) {
      const taxCode = one((await selectTaxCode(db, taxCodeId)).rows, "Tax code not found.");
      if (!taxCode.is_active || taxCode.effective_from > input.invoiceDate || (taxCode.effective_to && taxCode.effective_to < input.invoiceDate)) {
        throw new AppError(400, "VALIDATION", "The tax code is not effective on the invoice date.");
      }
      rate = taxCode.rate_percent;
      taxAccount = taxCode.sales_account_id;
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
    if (decimal(priced.taxAmount).gt(0) && !taxAccount) {
      throw new AppError(400, "TAX_ACCOUNT", "The tax code needs a sales account before it can be used on an invoice.");
    }
    taxable = taxable.plus(priced.taxableBase);
    tax = tax.plus(priced.taxAmount);
    total = total.plus(priced.lineTotal);
    lines.push([
      index + 1, product.id, line.description?.trim() || product.name, money(line.quantity), line.unitId ?? null, factor, money(line.unitPrice),
      priced.discountAmount, settings.discount_treatment, taxCodeId, settings.tax_pricing_mode, rate,
      priced.taxableBase, priced.taxAmount, priced.lineTotal, product.sales_account_id, taxAccount,
    ]);
  }
  return { dueDate, terms, overridden, mode: settings.tax_pricing_mode as TaxMode, treatment: settings.discount_treatment as DiscountTreatment, taxable: money(taxable), tax: money(tax), total: money(total), lines };
}

async function assertCredit(db: Sql, customerId: string, invoiceTotal: string, override: boolean, meta: RequestMeta) {
  const customer = one((await selectCustomerForSale(db, customerId)).rows);
  if (!customer.credit_limit) return;
  const exposure = one((await selectExposure(db, customerId)).rows);
  const next = decimal(exposure.receivables).minus(decimal(exposure.advances)).plus(decimal(invoiceTotal));
  if (next.lte(decimal(customer.credit_limit))) return;
  if (!override || !allowed(meta.actor, "invoices.override_credit_limit")) {
    throw new AppError(409, "CREDIT_LIMIT", "This invoice exceeds the customer credit limit.");
  }
  await audit(db, meta, "invoices.override_credit_limit", customerId, "Posted an invoice above the credit limit", { creditLimit: customer.credit_limit, exposure: money(next) }, { invoiceTotal });
}

async function transition(id: string, meta: RequestMeta, from: string, to: string, sql: string, action: string) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== from) throw new AppError(409, "INVOICE_STATE", `The invoice must be ${from}.`);
    await setInvoiceStatus(client, id, `status = '${to}', ${sql}`, [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, action, id, `${action} ${saved.invoiceNumber}`, current, saved);
    return saved;
  });
}

async function load(db: Sql, id: string, actor: AuthUser, lock: boolean) {
  const row = one((await selectInvoice(db, id, lock)).rows, "Invoice not found.");
  if (actor.branchIds && !actor.branchIds.includes(row.branch_id)) throw new AppError(404, "NOT_FOUND", "Invoice not found.");
  const lines = await selectInvoiceLines(db, id);
  return { ...mapHeader(row), lines: lines.rows.map(mapLine) };
}

function mapHeader(row: {
  id: string; invoice_number: string; customer_id: string; customer_name: string; branch_id: string; status: string;
  invoice_date: string; due_date: string; payment_terms_days: number; due_date_overridden: boolean;
  tax_pricing_mode: string; discount_treatment: string; notes: string | null; taxable_total: string; tax_total: string;
  total: string; journal_entry_id: string | null; created_by: string; submitted_by: string | null; approved_by: string | null; posted_by: string | null;
}) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    branchId: row.branch_id,
    status: row.status,
    invoiceDate: row.invoice_date,
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
  taxable_base: string; tax_amount: string; line_total: string; sales_account_id: string; tax_account_id: string | null;
}) {
  return {
    id: row.id, lineNo: row.line_no, productId: row.product_id, description: row.description, quantity: row.quantity,
    unitId: row.unit_id, unitPrice: row.unit_price, discountAmount: row.discount_amount, taxCodeId: row.tax_code_id,
    taxPricingMode: row.tax_pricing_mode, taxRate: row.tax_rate, taxableBase: row.taxable_base, taxAmount: row.tax_amount,
    lineTotal: row.line_total, salesAccountId: row.sales_account_id, taxAccountId: row.tax_account_id,
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
    actorUserId: meta.actor.id, action, entityType: "invoice", entityId: id, summary, before, after,
    ipAddress: meta.ipAddress, requestId: meta.requestId,
  });
}

type Decimal = ReturnType<typeof decimal>;
