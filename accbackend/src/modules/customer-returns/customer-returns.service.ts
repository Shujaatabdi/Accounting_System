import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { assertIsoDate } from "../../shared/dates";
import { AppError, one } from "../../shared/errors";
import { decimal, money } from "../../shared/money";
import { pageResult, type Page } from "../../shared/http/pagination";
import type { AuthUser, RequestMeta } from "../auth/auth.types";
import { selectCurrencyScale, selectRequireDistinctApprover } from "../company/company.repository";
import { allocateNumber } from "../company/numbering.service";
import { selectSalesSettings } from "../company/sales.repository";
import { partialReturnAmounts, priceInvoiceLine } from "../invoices/invoice.math";
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
import {
  countReturns,
  insertReturn,
  lockInvoiceLine,
  replaceReturnLines,
  returnedAgainstLine,
  selectBranchActive,
  selectCustomerActive,
  selectProductReturn,
  selectReturn,
  selectReturnLines,
  selectReturns,
  selectTaxForReturn,
  setReturnStatus,
  updateReturn,
  updateReturnLineAmounts,
} from "./customer-returns.repository";

type ReturnLineInput = {
  invoiceLineId?: string | null;
  productId?: string | null;
  description?: string;
  quantity: string;
  unitPrice?: string;
  discountAmount?: string;
  taxCodeId?: string | null;
  returnAccountId?: string | null;
  disposition: "restockable" | "damaged" | "non_restockable";
};

type ReturnInput = {
  customerId: string;
  branchId: string;
  returnDate: string;
  reason: string;
  notes?: string | null;
  unreferenced: boolean;
  lines: ReturnLineInput[];
};

export async function listReturns(actor: AuthUser, page: Page, filters: { search?: string; status?: string; customerId?: string }) {
  const params: unknown[] = [];
  const where = ["TRUE"];
  if (actor.branchIds) {
    params.push(actor.branchIds);
    where.push(`r.branch_id = ANY($${params.length}::uuid[])`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`r.status = $${params.length}`);
  }
  if (filters.customerId) {
    params.push(filters.customerId);
    where.push(`r.customer_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(r.return_number ILIKE $${params.length} OR c.display_name ILIKE $${params.length} OR r.reason ILIKE $${params.length})`);
  }
  const clause = where.join(" AND ");
  const total = Number(one((await countReturns({ query }, clause, params)).rows).count);
  params.push(page.pageSize, page.offset);
  return pageResult((await selectReturns({ query }, clause, params)).rows.map(mapHeader), total, page);
}

export async function getReturn(id: string, actor: AuthUser) {
  return load({ query }, id, actor, false);
}

export async function createReturn(input: ReturnInput, meta: RequestMeta) {
  assertIsoDate(input.returnDate);
  if (input.unreferenced && !allowed(meta.actor, "customer_returns.create_unreferenced")) {
    throw new AppError(403, "FORBIDDEN", "An unreferenced return requires permission.");
  }
  return withTransaction(async (client) => {
    const built = await build(client, input, meta, false);
    const number = await allocateNumber(client, "customer_return");
    const row = one((await insertReturn(client, [
      number, input.customerId, input.branchId, built.invoiceId, input.unreferenced, input.returnDate, input.reason.trim(),
      input.notes ?? null, built.taxable, built.tax, built.total, meta.actor.id,
    ])).rows);
    await replaceReturnLines(client, row.id, built.lines);
    const saved = await load(client, row.id, meta.actor, false);
    await audit(client, meta, input.unreferenced ? "customer_returns.create_unreferenced" : "customer_returns.create", row.id, `Created ${number}`, null, saved);
    return saved;
  });
}

export async function updateReturnDraft(id: string, input: ReturnInput, meta: RequestMeta) {
  assertIsoDate(input.returnDate);
  if (input.unreferenced && !allowed(meta.actor, "customer_returns.create_unreferenced")) {
    throw new AppError(403, "FORBIDDEN", "An unreferenced return requires permission.");
  }
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (!["draft", "rejected"].includes(current.status)) throw new AppError(409, "RETURN_STATE", "Only a draft or rejected return can be edited.");
    const built = await build(client, input, meta, false);
    await updateReturn(client, id, [
      input.customerId, input.branchId, built.invoiceId, input.unreferenced, input.returnDate, input.reason.trim(),
      input.notes ?? null, built.taxable, built.tax, built.total,
    ]);
    await replaceReturnLines(client, id, built.lines);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "customer_returns.update", id, `Updated ${saved.returnNumber}`, current, saved);
    return saved;
  });
}

export async function submitReturn(id: string, meta: RequestMeta) {
  return transition(id, meta, "draft", "submitted", "submitted_at = now(), submitted_by = $2", "customer_returns.submit");
}

export async function rejectReturn(id: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "submitted") throw new AppError(409, "RETURN_STATE", "Only a submitted return can be rejected.");
    await setReturnStatus(client, id, "status = 'rejected'", []);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "customer_returns.reject", id, reason, current, saved);
    return saved;
  });
}

export async function approveReturn(id: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "submitted") throw new AppError(409, "RETURN_STATE", "Only a submitted return can be approved.");
    const company = one((await selectRequireDistinctApprover(client)).rows);
    if (company.require_distinct_approver && current.submittedBy === meta.actor.id) {
      throw new AppError(403, "SEPARATION", "A different person must approve this return.");
    }
    await setReturnStatus(client, id, "status = 'approved', approved_at = now(), approved_by = $2", [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "customer_returns.approve", id, `Approved ${saved.returnNumber}`, current, saved);
    return saved;
  });
}

export async function postReturn(id: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "approved") throw new AppError(409, "RETURN_STATE", "Only an approved return can be posted.");
    const settings = one((await selectSalesSettings(client)).rows);
    if (!settings.ar_control_account_id) throw new AppError(409, "AR_CONTROL", "Choose the receivable control account before posting a return.");
    const scale = one((await selectCurrencyScale(client)).rows).currency_decimal_places;
    const accepted = new Map<string, { quantity: string; taxable: string; tax: string; total: string }>();
    let taxable = decimal("0");
    let tax = decimal("0");
    let total = decimal("0");
    const revenue = new Map<string, ReturnType<typeof decimal>>();
    const taxAccounts = new Map<string, ReturnType<typeof decimal>>();
    for (const line of current.lines) {
      let amounts = { taxableBase: line.taxableBase, taxAmount: line.taxAmount, lineTotal: line.lineTotal };
      if (line.invoiceLineId) {
        const source = one((await lockInvoiceLine(client, line.invoiceLineId)).rows, "Invoice line not found.");
        if (source.invoice_status !== "posted") {
          throw new AppError(409, "RETURN_SOURCE", "Returns are only allowed against a posted invoice. Voided and reversed invoices are rejected.");
        }
        if (source.customer_id !== current.customerId) throw new AppError(409, "RETURN_SOURCE", "The invoice line belongs to a different customer.");
        const prior = one((await returnedAgainstLine(client, line.invoiceLineId)).rows);
        const extra = accepted.get(line.invoiceLineId) ?? { quantity: "0", taxable: "0", tax: "0", total: "0" };
        amounts = partialReturnAmounts({
          originalQuantity: source.quantity,
          originalTaxableBase: source.taxable_base,
          originalTaxAmount: source.tax_amount,
          originalLineTotal: source.line_total,
          returnedQuantity: money(decimal(prior.quantity).plus(extra.quantity)),
          returnedTaxableBase: money(decimal(prior.taxable_base).plus(extra.taxable)),
          returnedTaxAmount: money(decimal(prior.tax_amount).plus(extra.tax)),
          returnedLineTotal: money(decimal(prior.line_total).plus(extra.total)),
          quantity: line.quantity,
          scale,
        });
        accepted.set(line.invoiceLineId, {
          quantity: money(decimal(extra.quantity).plus(line.quantity)),
          taxable: money(decimal(extra.taxable).plus(amounts.taxableBase)),
          tax: money(decimal(extra.tax).plus(amounts.taxAmount)),
          total: money(decimal(extra.total).plus(amounts.lineTotal)),
        });
        if (decimal(amounts.lineTotal).gt(decimal(source.line_total).minus(decimal(prior.line_total)).minus(decimal(extra.total)))) {
          throw new AppError(409, "RETURN_LIMIT", "The return exceeds the value still available on that invoice line.");
        }
        await updateReturnLineAmounts(client, line.id, amounts.taxableBase, amounts.taxAmount, amounts.lineTotal);
      }
      taxable = taxable.plus(amounts.taxableBase);
      tax = tax.plus(amounts.taxAmount);
      total = total.plus(amounts.lineTotal);
      addMap(revenue, line.returnAccountId, amounts.taxableBase);
      if (decimal(amounts.taxAmount).gt(0)) {
        if (!line.taxAccountId) throw new AppError(409, "TAX_ACCOUNT", "The return tax has no saved tax account.");
        addMap(taxAccounts, line.taxAccountId, amounts.taxAmount);
      }
    }
    const journalId = await postSystemJournal(client, {
      entryNumber: await allocateNumber(client, "journal"),
      entryDate: current.returnDate,
      description: `Customer return ${current.returnNumber}`,
      reference: current.returnNumber,
      sourceType: "customer_return",
      sourceId: id,
      createdBy: meta.actor.id,
      lines: [
        ...[...revenue].map(([accountId, amount]) => ({ accountId, branchId: current.branchId, description: current.returnNumber, debit: money(amount), credit: "0" })),
        ...[...taxAccounts].map(([accountId, amount]) => ({ accountId, branchId: current.branchId, description: current.returnNumber, debit: money(amount), credit: "0" })),
        { accountId: settings.ar_control_account_id, branchId: current.branchId, description: current.returnNumber, debit: "0", credit: money(total) },
      ],
    });
    await setReturnStatus(client, id, "status = 'posted', taxable_total = $2, tax_total = $3, total = $4, journal_entry_id = $5, posted_at = now(), posted_by = $6", [
      money(taxable), money(tax), money(total), journalId, meta.actor.id,
    ]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "customer_returns.post", id, `Posted ${saved.returnNumber}`, current, saved);
    return saved;
  });
}

export async function voidReturn(id: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (!["draft", "submitted", "approved", "rejected"].includes(current.status)) {
      throw new AppError(409, "RETURN_STATE", "A posted return cannot be voided. Reverse it.");
    }
    await setReturnStatus(client, id, "status = 'void', voided_at = now(), voided_by = $2", [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "customer_returns.void", id, reason, current, saved);
    return saved;
  });
}

export async function reverseReturn(id: string, input: { reason: string; postingDate?: string }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "posted" || !current.journalEntryId) throw new AppError(409, "RETURN_STATE", "Only a posted return can be reversed.");
    const postingDate = input.postingDate ?? current.returnDate;
    assertIsoDate(postingDate);
    const periodId = await openPeriodId(client, postingDate);
    const lines = await lockEntryLines(client, current.journalEntryId);
    const reversal = one((await insertReversalJournal(client, [
      await allocateNumber(client, "journal"), postingDate, `Reversal of return ${current.returnNumber}: ${input.reason}`, current.returnNumber, current.journalEntryId, meta.actor.id,
    ])).rows);
    await insertReversalLines(client, reversal.id, lines);
    await allowSystemPost(client);
    await markPosted(client, reversal.id, postingDate, periodId, meta.actor.id);
    await markReversedBy(client, current.journalEntryId, reversal.id);
    await setReturnStatus(client, id, "status = 'reversed'", []);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "customer_returns.reverse", id, input.reason, current, saved);
    return saved;
  });
}

async function build(db: Sql, input: ReturnInput, meta: RequestMeta, locked: boolean) {
  if (meta.actor.branchIds && !meta.actor.branchIds.includes(input.branchId)) throw new AppError(403, "BRANCH_SCOPE", "That branch is outside your access.");
  const branch = one((await selectBranchActive(db, input.branchId)).rows, "Branch not found.");
  if (!branch.is_active) throw new AppError(400, "VALIDATION", "The branch is inactive.");
  const customer = one((await selectCustomerActive(db, input.customerId)).rows, "Customer not found.");
  if (!customer.is_active) throw new AppError(400, "VALIDATION", "The customer is inactive.");
  const settings = one((await selectSalesSettings(db)).rows);
  const scale = one((await selectCurrencyScale(db)).rows).currency_decimal_places;
  let invoiceId: string | null = null;
  const lines = [];
  let taxable = decimal("0");
  let tax = decimal("0");
  let total = decimal("0");
  for (const [index, line] of input.lines.entries()) {
    if (input.unreferenced) {
      if (line.invoiceLineId) throw new AppError(400, "VALIDATION", "An unreferenced return cannot point at an invoice line.");
      if (!line.productId || !line.unitPrice || !line.returnAccountId) {
        throw new AppError(400, "VALIDATION", "An unreferenced return needs a product, price, and return account on every line.");
      }
      const product = one((await selectProductReturn(db, line.productId)).rows, "Product not found.");
      if (!product.is_active) throw new AppError(400, "VALIDATION", "The product is inactive.");
      let rate = "0";
      let taxAccount: string | null = null;
      if (line.taxCodeId) {
        const taxCode = one((await selectTaxForReturn(db, line.taxCodeId)).rows, "Tax code not found.");
        if (!taxCode.is_active || taxCode.effective_from > input.returnDate || (taxCode.effective_to && taxCode.effective_to < input.returnDate)) {
          throw new AppError(400, "VALIDATION", "The tax code is not effective on the return date.");
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
      if (decimal(priced.taxAmount).gt(0) && !taxAccount) throw new AppError(400, "TAX_ACCOUNT", "The tax code needs a sales account.");
      taxable = taxable.plus(priced.taxableBase);
      tax = tax.plus(priced.taxAmount);
      total = total.plus(priced.lineTotal);
      lines.push([
        index + 1, null, product.id, line.description?.trim() || product.name, money(line.quantity), money(line.unitPrice),
        priced.discountAmount, settings.discount_treatment, settings.tax_pricing_mode, rate,
        priced.taxableBase, priced.taxAmount, priced.lineTotal, line.returnAccountId, taxAccount, line.disposition,
      ]);
    } else {
      if (!line.invoiceLineId) throw new AppError(400, "VALIDATION", "Each return line must name the invoice line it returns.");
      const source = one((await lockInvoiceLine(db, line.invoiceLineId)).rows, "Invoice line not found.");
      if (!locked && source.invoice_status !== "posted") {
        throw new AppError(409, "RETURN_SOURCE", "Returns are only allowed against a posted invoice. Voided and reversed invoices are rejected.");
      }
      if (source.customer_id !== input.customerId) throw new AppError(409, "RETURN_SOURCE", "The invoice line belongs to a different customer.");
      if (invoiceId && invoiceId !== source.invoice_id) throw new AppError(400, "VALIDATION", "A return can reference lines from one invoice.");
      invoiceId = source.invoice_id;
      const prior = one((await returnedAgainstLine(db, line.invoiceLineId)).rows);
      const amounts = partialReturnAmounts({
        originalQuantity: source.quantity,
        originalTaxableBase: source.taxable_base,
        originalTaxAmount: source.tax_amount,
        originalLineTotal: source.line_total,
        returnedQuantity: prior.quantity,
        returnedTaxableBase: prior.taxable_base,
        returnedTaxAmount: prior.tax_amount,
        returnedLineTotal: prior.line_total,
        quantity: line.quantity,
        scale,
      });
      taxable = taxable.plus(amounts.taxableBase);
      tax = tax.plus(amounts.taxAmount);
      total = total.plus(amounts.lineTotal);
      lines.push([
        index + 1, source.id, source.product_id, line.description?.trim() || source.description, money(line.quantity), source.unit_price,
        source.discount_amount, source.discount_treatment, source.tax_pricing_mode, source.tax_rate,
        amounts.taxableBase, amounts.taxAmount, amounts.lineTotal, source.sales_account_id, source.tax_account_id, line.disposition,
      ]);
    }
  }
  return { invoiceId, taxable: money(taxable), tax: money(tax), total: money(total), lines };
}

async function transition(id: string, meta: RequestMeta, from: string, to: string, sql: string, action: string) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== from) throw new AppError(409, "RETURN_STATE", `The return must be ${from}.`);
    await setReturnStatus(client, id, `status = '${to}', ${sql}`, [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, action, id, `${action} ${saved.returnNumber}`, current, saved);
    return saved;
  });
}

async function load(db: Sql, id: string, actor: AuthUser, lock: boolean) {
  const row = one((await selectReturn(db, id, lock)).rows, "Customer return not found.");
  if (actor.branchIds && !actor.branchIds.includes(row.branch_id)) throw new AppError(404, "NOT_FOUND", "Customer return not found.");
  const lines = await selectReturnLines(db, id);
  return {
    ...mapHeader(row),
    lines: lines.rows.map((line) => ({
      id: line.id, lineNo: line.line_no, invoiceLineId: line.invoice_line_id, productId: line.product_id,
      description: line.description, quantity: line.quantity, unitPrice: line.unit_price, discountAmount: line.discount_amount,
      taxPricingMode: line.tax_pricing_mode, taxRate: line.tax_rate, taxableBase: line.taxable_base, taxAmount: line.tax_amount,
      lineTotal: line.line_total, returnAccountId: line.return_account_id, taxAccountId: line.tax_account_id, disposition: line.disposition,
    })),
  };
}

function mapHeader(row: {
  id: string; return_number: string; customer_id: string; customer_name: string; branch_id: string; invoice_id: string | null;
  unreferenced: boolean; status: string; return_date: string; reason: string; notes: string | null; taxable_total: string;
  tax_total: string; total: string; journal_entry_id: string | null; created_by: string; submitted_by: string | null; approved_by: string | null;
}) {
  return {
    id: row.id, returnNumber: row.return_number, customerId: row.customer_id, customerName: row.customer_name,
    branchId: row.branch_id, invoiceId: row.invoice_id, unreferenced: row.unreferenced, status: row.status,
    returnDate: row.return_date, reason: row.reason, notes: row.notes, taxableTotal: row.taxable_total,
    taxTotal: row.tax_total, total: row.total, journalEntryId: row.journal_entry_id, createdBy: row.created_by,
    submittedBy: row.submitted_by, approvedBy: row.approved_by,
  };
}

function addMap(target: Map<string, ReturnType<typeof decimal>>, key: string, amount: string) {
  target.set(key, (target.get(key) ?? decimal("0")).plus(decimal(amount)));
}

function allowed(actor: AuthUser, permission: string) {
  return actor.isCompanyAdmin || actor.permissions.includes(permission);
}

function audit(db: Sql, meta: RequestMeta, action: string, id: string, summary: string, before: unknown, after: unknown) {
  return writeAudit(db, {
    actorUserId: meta.actor.id, action, entityType: "customer_return", entityId: id, summary, before, after,
    ipAddress: meta.ipAddress, requestId: meta.requestId,
  });
}
