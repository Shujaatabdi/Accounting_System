import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { assertIsoDate } from "../../shared/dates";
import { AppError, one } from "../../shared/errors";
import { decimal, money } from "../../shared/money";
import { pageResult, type Page } from "../../shared/http/pagination";
import type { AuthUser, RequestMeta } from "../auth/auth.types";
import { selectRequireDistinctApprover } from "../company/company.repository";
import { allocateNumber } from "../company/numbering.service";
import { selectSalesSettings } from "../company/sales.repository";
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
  countReceipts,
  insertAllocation,
  insertReceipt,
  lockInvoiceOpen,
  markAllocationPosted,
  replaceDraftAllocations,
  selectBranchForReceipt,
  selectCustomerForReceipt,
  selectAllocation,
  selectAllocations,
  selectCashAccount,
  selectReceipt,
  selectReceipts,
  setAllocationStatus,
  setReceiptStatus,
  updateReceipt,
} from "./receipts.repository";

type ReceiptInput = {
  customerId: string;
  branchId: string;
  receiptDate: string;
  cashAccountId: string;
  amount: string;
  notes?: string | null;
  allocations: Array<{ invoiceId: string; amount: string }>;
};

export async function listReceipts(actor: AuthUser, page: Page, filters: { search?: string; status?: string; customerId?: string }) {
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
    where.push(`(r.receipt_number ILIKE $${params.length} OR c.display_name ILIKE $${params.length})`);
  }
  const clause = where.join(" AND ");
  const total = Number(one((await countReceipts({ query }, clause, params)).rows).count);
  params.push(page.pageSize, page.offset);
  return pageResult((await selectReceipts({ query }, clause, params)).rows.map(mapHeader), total, page);
}

export async function getReceipt(id: string, actor: AuthUser) {
  return load({ query }, id, actor, false);
}

export async function createReceipt(input: ReceiptInput, meta: RequestMeta) {
  assertIsoDate(input.receiptDate);
  return withTransaction(async (client) => {
    const prepared = await prepare(client, input, meta);
    const number = await allocateNumber(client, "receipt");
    const row = one((await insertReceipt(client, [
      number, input.customerId, input.branchId, input.receiptDate, input.cashAccountId, prepared.amount,
      prepared.amount, prepared.treatment, prepared.advanceAccountId, input.notes ?? null, meta.actor.id,
    ])).rows);
    await replaceDraftAllocations(client, row.id, prepared.allocations);
    const saved = await load(client, row.id, meta.actor, false);
    await audit(client, meta, "receipts.create", row.id, `Created ${number}`, null, saved);
    return saved;
  });
}

export async function updateReceiptDraft(id: string, input: ReceiptInput, meta: RequestMeta) {
  assertIsoDate(input.receiptDate);
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (!["draft", "rejected"].includes(current.status)) throw new AppError(409, "RECEIPT_STATE", "Only a draft or rejected receipt can be edited.");
    const prepared = await prepare(client, input, meta);
    await updateReceipt(client, id, [
      input.customerId, input.branchId, input.receiptDate, input.cashAccountId, prepared.amount,
      prepared.amount, prepared.treatment, prepared.advanceAccountId, input.notes ?? null,
    ]);
    await replaceDraftAllocations(client, id, prepared.allocations);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "receipts.update", id, `Updated ${saved.receiptNumber}`, current, saved);
    return saved;
  });
}

export async function submitReceipt(id: string, meta: RequestMeta) {
  return transition(id, meta, "draft", "submitted", "submitted_at = now(), submitted_by = $2");
}

export async function rejectReceipt(id: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "submitted") throw new AppError(409, "RECEIPT_STATE", "Only a submitted receipt can be rejected.");
    await setReceiptStatus(client, id, "status = 'rejected'", []);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "receipts.reject", id, reason, current, saved);
    return saved;
  });
}

export async function approveReceipt(id: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "submitted") throw new AppError(409, "RECEIPT_STATE", "Only a submitted receipt can be approved.");
    const company = one((await selectRequireDistinctApprover(client)).rows);
    if (company.require_distinct_approver && current.submittedBy === meta.actor.id) {
      throw new AppError(403, "SEPARATION", "A different person must approve this receipt.");
    }
    await setReceiptStatus(client, id, "status = 'approved', approved_at = now(), approved_by = $2", [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "receipts.approve", id, `Approved ${saved.receiptNumber}`, current, saved);
    return saved;
  });
}

export async function postReceipt(id: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "approved") throw new AppError(409, "RECEIPT_STATE", "Only an approved receipt can be posted.");
    const settings = one((await selectSalesSettings(client)).rows);
    if (!settings.ar_control_account_id) throw new AppError(409, "AR_CONTROL", "Choose the receivable control account before posting a receipt.");
    if (current.unappliedTreatment === "customer_advance" && !current.advanceAccountId) {
      throw new AppError(409, "ADVANCE_ACCOUNT", "Choose a customer advance liability account before posting this receipt.");
    }
    const creditAccount = current.unappliedTreatment === "customer_advance" ? current.advanceAccountId! : settings.ar_control_account_id;
    const journalId = await postSystemJournal(client, {
      entryNumber: await allocateNumber(client, "journal"),
      entryDate: current.receiptDate,
      description: `Receipt ${current.receiptNumber}`,
      reference: current.receiptNumber,
      sourceType: "receipt",
      sourceId: id,
      createdBy: meta.actor.id,
      lines: [
        { accountId: current.cashAccountId, branchId: current.branchId, description: current.receiptNumber, debit: current.amount, credit: "0" },
        { accountId: creditAccount, branchId: current.branchId, description: current.receiptNumber, debit: "0", credit: current.amount },
      ],
    });
    let allocated = decimal("0");
    for (const allocation of current.allocations.filter((item) => item.status === "draft")) {
      await applyAllocation(client, current, allocation.invoiceId, allocation.amount, allocation.id, meta, settings.ar_control_account_id);
      allocated = allocated.plus(allocation.amount);
    }
    const unallocated = decimal(current.amount).minus(allocated);
    await setReceiptStatus(client, id, "status = 'posted', journal_entry_id = $2, posted_at = now(), posted_by = $3, unallocated_amount = $4", [journalId, meta.actor.id, money(unallocated)]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "receipts.post", id, `Posted ${saved.receiptNumber}`, current, saved);
    return saved;
  });
}

export async function allocateReceipt(id: string, input: { invoiceId: string; amount: string }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "posted") throw new AppError(409, "RECEIPT_STATE", "Only a posted receipt can be allocated.");
    if (decimal(input.amount).gt(decimal(current.unallocatedAmount))) {
      throw new AppError(409, "ALLOCATION", "The allocation exceeds the unallocated receipt amount.");
    }
    const settings = one((await selectSalesSettings(client)).rows);
    if (!settings.ar_control_account_id) throw new AppError(409, "AR_CONTROL", "Choose the receivable control account before allocating a receipt.");
    const created = one((await insertAllocation(client, [id, input.invoiceId, money(input.amount), "draft", null])).rows);
    await applyAllocation(client, current, input.invoiceId, money(input.amount), created.id, meta, settings.ar_control_account_id);
    await setReceiptStatus(client, id, "unallocated_amount = unallocated_amount - $2", [money(input.amount)]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "receipts.allocate", id, `Allocated ${money(input.amount)} from ${saved.receiptNumber}`, current, saved);
    return saved;
  });
}

export async function unallocateReceipt(receiptId: string, allocationId: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, receiptId, meta.actor, true);
    const allocation = one((await selectAllocation(client, allocationId, true)).rows, "Allocation not found.");
    if (allocation.receipt_id !== receiptId || allocation.status !== "posted") {
      throw new AppError(409, "ALLOCATION", "Only a posted allocation on this receipt can be removed.");
    }
    if (allocation.journal_entry_id) {
      await reverseJournal(client, allocation.journal_entry_id, current.receiptDate, `Unallocate receipt ${current.receiptNumber}`, meta);
    }
    await setAllocationStatus(client, allocationId, "reversed");
    await setReceiptStatus(client, receiptId, "unallocated_amount = unallocated_amount + $2", [allocation.amount]);
    const saved = await load(client, receiptId, meta.actor, false);
    await audit(client, meta, "receipts.unallocate", receiptId, `Removed an allocation from ${saved.receiptNumber}`, current, saved);
    return saved;
  });
}

export async function voidReceipt(id: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (!["draft", "submitted", "approved", "rejected"].includes(current.status)) {
      throw new AppError(409, "RECEIPT_STATE", "A posted receipt cannot be voided. Unallocate it and reverse it.");
    }
    await setReceiptStatus(client, id, "status = 'void', voided_at = now(), voided_by = $2", [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "receipts.void", id, reason, current, saved);
    return saved;
  });
}

export async function reverseReceipt(id: string, input: { reason: string; postingDate?: string }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "posted" || !current.journalEntryId) throw new AppError(409, "RECEIPT_STATE", "Only a posted receipt can be reversed.");
    if (current.allocations.some((allocation) => allocation.status === "posted")) {
      throw new AppError(409, "RECEIPT_DEPENDENTS", "Unallocate this receipt before reversing it.");
    }
    const postingDate = input.postingDate ?? current.receiptDate;
    await reverseJournal(client, current.journalEntryId, postingDate, input.reason, meta);
    await setReceiptStatus(client, id, "status = 'reversed', unallocated_amount = 0", []);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "receipts.reverse", id, input.reason, current, saved);
    return saved;
  });
}

async function applyAllocation(
  db: Sql,
  receipt: { id: string; receiptNumber: string; customerId: string; branchId: string; receiptDate: string; unappliedTreatment: string; advanceAccountId: string | null },
  invoiceId: string,
  amount: string,
  allocationId: string,
  meta: RequestMeta,
  arAccountId: string,
) {
  const invoice = one((await lockInvoiceOpen(db, invoiceId)).rows, "Invoice not found.");
  if (invoice.status !== "posted") throw new AppError(409, "ALLOCATION", "A receipt can only be applied to a posted invoice.");
  if (invoice.customer_id !== receipt.customerId) throw new AppError(409, "ALLOCATION", "The invoice belongs to a different customer.");
  if (decimal(amount).gt(decimal(invoice.open_amount))) {
    throw new AppError(409, "ALLOCATION", "The allocation exceeds the open invoice balance.");
  }
  let journalId: string | null = null;
  if (receipt.unappliedTreatment === "customer_advance") {
    if (!receipt.advanceAccountId) throw new AppError(409, "ADVANCE_ACCOUNT", "Choose a customer advance liability account before allocating this receipt.");
    journalId = await postSystemJournal(db, {
      entryNumber: await allocateNumber(db, "journal"),
      entryDate: receipt.receiptDate,
      description: `Allocate ${receipt.receiptNumber} to ${invoice.invoice_number}`,
      reference: receipt.receiptNumber,
      sourceType: "receipt_allocation",
      sourceId: allocationId,
      createdBy: meta.actor.id,
      lines: [
        { accountId: receipt.advanceAccountId, branchId: receipt.branchId, description: invoice.invoice_number, debit: amount, credit: "0" },
        { accountId: arAccountId, branchId: invoice.branch_id, description: invoice.invoice_number, debit: "0", credit: amount },
      ],
    });
  }
  await markAllocationPosted(db, allocationId, journalId);
}

async function reverseJournal(db: Sql, journalId: string, postingDate: string, reason: string, meta: RequestMeta) {
  assertIsoDate(postingDate);
  const periodId = await openPeriodId(db, postingDate);
  const lines = await lockEntryLines(db, journalId);
  const reversal = one((await insertReversalJournal(db, [
    await allocateNumber(db, "journal"), postingDate, reason, null, journalId, meta.actor.id,
  ])).rows);
  await insertReversalLines(db, reversal.id, lines);
  await allowSystemPost(db);
  await markPosted(db, reversal.id, postingDate, periodId, meta.actor.id);
  await markReversedBy(db, journalId, reversal.id);
}

async function prepare(db: Sql, input: ReceiptInput, meta: RequestMeta) {
  if (meta.actor.branchIds && !meta.actor.branchIds.includes(input.branchId)) throw new AppError(403, "BRANCH_SCOPE", "That branch is outside your access.");
  const branch = one((await selectBranchForReceipt(db, input.branchId)).rows, "Branch not found.");
  if (!branch.is_active) throw new AppError(400, "VALIDATION", "The branch is inactive.");
  const customer = one((await selectCustomerForReceipt(db, input.customerId)).rows, "Customer not found.");
  if (!customer.is_active) throw new AppError(400, "VALIDATION", "The customer is inactive.");
  const cash = one((await selectCashAccount(db, input.cashAccountId)).rows, "Cash account not found.");
  if (!cash.is_active || cash.is_header || cash.account_type !== "asset") throw new AppError(400, "VALIDATION", "The receipt account must be an active asset account.");
  const settings = one((await selectSalesSettings(db)).rows);
  if (cash.id === settings.ar_control_account_id) throw new AppError(400, "VALIDATION", "A receipt cannot use the receivable control account as the cash account.");
  if (settings.unapplied_receipt_treatment === "customer_advance" && !settings.customer_advance_account_id) {
    throw new AppError(409, "ADVANCE_ACCOUNT", "Choose a customer advance liability account before recording a receipt.");
  }
  const amount = money(input.amount);
  if (decimal(amount).lte(0)) throw new AppError(400, "VALIDATION", "The receipt amount must be greater than zero.");
  let allocated = decimal("0");
  const allocations = input.allocations.map((line) => {
    const lineAmount = money(line.amount);
    allocated = allocated.plus(lineAmount);
    return { invoiceId: line.invoiceId, amount: lineAmount };
  });
  if (allocated.gt(amount)) throw new AppError(409, "ALLOCATION", "Allocations cannot exceed the receipt amount.");
  return { amount, allocations, treatment: settings.unapplied_receipt_treatment, advanceAccountId: settings.customer_advance_account_id };
}

async function transition(id: string, meta: RequestMeta, from: string, to: string, sql: string) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== from) throw new AppError(409, "RECEIPT_STATE", `The receipt must be ${from}.`);
    await setReceiptStatus(client, id, `status = '${to}', ${sql}`, [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, `receipts.${to === "submitted" ? "submit" : to}`, id, `${to} ${saved.receiptNumber}`, current, saved);
    return saved;
  });
}

async function load(db: Sql, id: string, actor: AuthUser, lock: boolean) {
  const row = one((await selectReceipt(db, id, lock)).rows, "Receipt not found.");
  if (actor.branchIds && !actor.branchIds.includes(row.branch_id)) throw new AppError(404, "NOT_FOUND", "Receipt not found.");
  const allocations = await selectAllocations(db, id);
  return {
    ...mapHeader(row),
    allocations: allocations.rows.map((allocation) => ({
      id: allocation.id,
      invoiceId: allocation.invoice_id,
      invoiceNumber: allocation.invoice_number,
      amount: allocation.amount,
      status: allocation.status,
      journalEntryId: allocation.journal_entry_id,
    })),
  };
}

function mapHeader(row: {
  id: string; receipt_number: string; customer_id: string; customer_name: string; branch_id: string; status: string;
  receipt_date: string; cash_account_id: string; amount: string; unallocated_amount: string; unapplied_treatment: string;
  advance_account_id: string | null; notes: string | null; journal_entry_id: string | null; created_by: string;
  submitted_by: string | null; approved_by: string | null;
}) {
  return {
    id: row.id, receiptNumber: row.receipt_number, customerId: row.customer_id, customerName: row.customer_name,
    branchId: row.branch_id, status: row.status, receiptDate: row.receipt_date, cashAccountId: row.cash_account_id,
    amount: row.amount, unallocatedAmount: row.unallocated_amount, unappliedTreatment: row.unapplied_treatment,
    advanceAccountId: row.advance_account_id, notes: row.notes, journalEntryId: row.journal_entry_id,
    createdBy: row.created_by, submittedBy: row.submitted_by, approvedBy: row.approved_by,
  };
}

function audit(db: Sql, meta: RequestMeta, action: string, id: string, summary: string, before: unknown, after: unknown) {
  return writeAudit(db, {
    actorUserId: meta.actor.id, action, entityType: "receipt", entityId: id, summary, before, after,
    ipAddress: meta.ipAddress, requestId: meta.requestId,
  });
}
