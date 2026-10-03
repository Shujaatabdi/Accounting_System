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
import { selectPurchasingSettings } from "../company/purchasing.repository";
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
import { SUPPLIER_ADVANCE_SETUP, splitSupplierPayment } from "./payment.math";
import {
  countPayments,
  insertAllocation,
  insertPayment,
  lockBillOpen,
  markAllocationPosted,
  replaceDraftAllocations,
  selectAllocation,
  selectAllocations,
  selectBranch,
  selectCashAccount,
  selectPayment,
  selectPayments,
  selectSupplierForPayment,
  setAllocationStatus,
  setPaymentStatus,
  updatePayment,
} from "./supplier-payments.repository";
import type { allocationBody, paymentBody } from "./supplier-payments.schemas";
import type { z } from "zod";

type PaymentInput = z.infer<typeof paymentBody>;

export async function listPayments(actor: AuthUser, page: Page, filters: { search?: string; status?: string; supplierId?: string }) {
  const params: unknown[] = [];
  const where = ["TRUE"];
  applyBranch(actor, where, params, "p.branch_id");
  if (filters.status) {
    params.push(filters.status);
    where.push(`p.status = $${params.length}`);
  }
  if (filters.supplierId) {
    params.push(filters.supplierId);
    where.push(`p.supplier_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(p.payment_number ILIKE $${params.length} OR s.display_name ILIKE $${params.length})`);
  }
  const clause = where.join(" AND ");
  const total = Number(one((await countPayments({ query }, clause, params)).rows).count);
  params.push(page.pageSize, page.offset);
  return pageResult((await selectPayments({ query }, clause, params)).rows.map(mapHeader), total, page);
}

export async function getPayment(id: string, actor: AuthUser) {
  return load({ query }, id, actor, false);
}

export async function createPayment(input: PaymentInput, meta: RequestMeta) {
  assertIsoDate(input.paymentDate);
  return withTransaction(async (client) => {
    const prepared = await prepare(client, input, meta);
    const number = await allocateNumber(client, "supplier_payment");
    const row = one((await insertPayment(client, [
      number, input.supplierId, input.branchId, input.paymentDate, input.cashAccountId,
      prepared.amount, prepared.unapplied, prepared.treatment, prepared.advanceAccountId, input.notes ?? null, meta.actor.id,
    ])).rows);
    await replaceDraftAllocations(client, row.id, prepared.allocations);
    const saved = await load(client, row.id, meta.actor, false);
    await audit(client, meta, "supplier_payments.create", row.id, `Created ${number}`, null, saved);
    return saved;
  });
}

export async function updatePaymentDraft(id: string, input: PaymentInput, meta: RequestMeta) {
  assertIsoDate(input.paymentDate);
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (!["draft", "rejected"].includes(current.status)) throw new AppError(409, "PAYMENT_STATE", "Only a draft or rejected payment can be edited.");
    const prepared = await prepare(client, input, meta);
    await updatePayment(client, id, [
      input.supplierId, input.branchId, input.paymentDate, input.cashAccountId,
      prepared.amount, prepared.unapplied, prepared.treatment, prepared.advanceAccountId, input.notes ?? null,
    ]);
    await replaceDraftAllocations(client, id, prepared.allocations);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "supplier_payments.update", id, `Updated ${saved.paymentNumber}`, current, saved);
    return saved;
  });
}

export async function submitPayment(id: string, meta: RequestMeta) {
  return transition(id, meta, "draft", "submitted", "submitted_at = now(), submitted_by = $2");
}

export async function rejectPayment(id: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "submitted") throw new AppError(409, "PAYMENT_STATE", "Only a submitted payment can be rejected.");
    await setPaymentStatus(client, id, "status = 'rejected'", []);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "supplier_payments.reject", id, reason, current, saved);
    return saved;
  });
}

export async function approvePayment(id: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "submitted") throw new AppError(409, "PAYMENT_STATE", "Only a submitted payment can be approved.");
    const company = one((await selectRequireDistinctApprover(client)).rows);
    if (company.require_distinct_approver && current.submittedBy === meta.actor.id) {
      throw new AppError(403, "SEPARATION", "A different person must approve this payment.");
    }
    await setPaymentStatus(client, id, "status = 'approved', approved_at = now(), approved_by = $2", [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "supplier_payments.approve", id, `Approved ${saved.paymentNumber}`, current, saved);
    return saved;
  });
}

export async function postPayment(id: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "approved") throw new AppError(409, "PAYMENT_STATE", "Only an approved payment can be posted.");
    const settings = one((await selectPurchasingSettings(client)).rows);
    if (!settings.ap_control_account_id) {
      throw new AppError(409, "AP_CONTROL", "Choose the payable control account in Purchasing settings before posting a supplier payment.");
    }
    const drafts = current.allocations.filter((item) => item.status === "draft");
    const split = splitSupplierPayment(current.amount, money(drafts.reduce((sum, item) => sum.plus(item.amount), decimal("0"))));
    let journalId: string;
    if (split.treatment === "supplier_advance") {
      if (!settings.supplier_advance_account_id) throw new AppError(409, "ADVANCE_ACCOUNT", SUPPLIER_ADVANCE_SETUP);
      await assertAsset(client, settings.supplier_advance_account_id, "The supplier advance account must be an active asset account.");
      journalId = await postSystemJournal(client, {
        entryNumber: await allocateNumber(client, "journal"),
        entryDate: current.paymentDate,
        description: `Supplier payment ${current.paymentNumber}`,
        reference: current.paymentNumber,
        sourceType: "supplier_payment",
        sourceId: id,
        createdBy: meta.actor.id,
        lines: [
          { accountId: settings.supplier_advance_account_id, branchId: current.branchId, description: current.paymentNumber, debit: current.amount, credit: "0" },
          { accountId: current.cashAccountId, branchId: current.branchId, description: current.paymentNumber, debit: "0", credit: current.amount },
        ],
      });
      for (const allocation of drafts) {
        await applyAdvance(client, { ...current, advanceAccountId: settings.supplier_advance_account_id }, allocation.billId, allocation.amount, allocation.id, meta, settings.ap_control_account_id);
      }
    } else {
      journalId = await postSystemJournal(client, {
        entryNumber: await allocateNumber(client, "journal"),
        entryDate: current.paymentDate,
        description: `Supplier payment ${current.paymentNumber}`,
        reference: current.paymentNumber,
        sourceType: "supplier_payment",
        sourceId: id,
        createdBy: meta.actor.id,
        lines: [
          { accountId: settings.ap_control_account_id, branchId: current.branchId, description: current.paymentNumber, debit: current.amount, credit: "0" },
          { accountId: current.cashAccountId, branchId: current.branchId, description: current.paymentNumber, debit: "0", credit: current.amount },
        ],
      });
      for (const allocation of drafts) {
        const bill = one((await lockBillOpen(client, allocation.billId)).rows, "Supplier bill not found.");
        assertBillPayable(bill, current.supplierId, allocation.amount);
        await markAllocationPosted(client, allocation.id, journalId);
      }
    }
    await setPaymentStatus(client, id, "status = 'posted', journal_entry_id = $2, posted_at = now(), posted_by = $3, unallocated_amount = $4, ap_treatment = $5, advance_account_id = $6", [
      journalId, meta.actor.id, split.unapplied, split.treatment, split.treatment === "supplier_advance" ? settings.supplier_advance_account_id : null,
    ]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "supplier_payments.post", id, `Posted ${saved.paymentNumber}`, current, saved);
    return saved;
  });
}

export async function allocatePayment(id: string, input: z.infer<typeof allocationBody>, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "posted") throw new AppError(409, "PAYMENT_STATE", "Only a posted payment can be allocated.");
    if (current.apTreatment !== "supplier_advance") {
      throw new AppError(409, "ALLOCATION", "This payment was applied directly to accounts payable. Reverse it before applying a different bill.");
    }
    if (decimal(input.amount).gt(decimal(current.unallocatedAmount))) {
      throw new AppError(409, "ALLOCATION", "The allocation exceeds the unallocated payment amount.");
    }
    const settings = one((await selectPurchasingSettings(client)).rows);
    if (!settings.ap_control_account_id) throw new AppError(409, "AP_CONTROL", "Choose the payable control account before allocating a supplier payment.");
    if (!current.advanceAccountId) throw new AppError(409, "ADVANCE_ACCOUNT", SUPPLIER_ADVANCE_SETUP);
    const created = one((await insertAllocation(client, [id, input.billId, money(input.amount), "draft", null])).rows);
    await applyAdvance(client, current, input.billId, money(input.amount), created.id, meta, settings.ap_control_account_id);
    await setPaymentStatus(client, id, "unallocated_amount = unallocated_amount - $2", [money(input.amount)]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "supplier_payments.allocate", id, `Allocated ${money(input.amount)} from ${saved.paymentNumber}`, current, saved);
    return saved;
  });
}

export async function unallocatePayment(paymentId: string, allocationId: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, paymentId, meta.actor, true);
    const allocation = one((await selectAllocation(client, allocationId, true)).rows, "Allocation not found.");
    if (allocation.supplier_payment_id !== paymentId || allocation.status !== "posted") {
      throw new AppError(409, "ALLOCATION", "Only a posted allocation on this payment can be removed.");
    }
    if (!allocation.journal_entry_id || allocation.journal_entry_id === current.journalEntryId) {
      throw new AppError(409, "ALLOCATION", "This payment was applied directly to accounts payable. Reverse the payment to undo it.");
    }
    await reverseJournal(client, allocation.journal_entry_id, current.paymentDate, `Unallocate supplier payment ${current.paymentNumber}`, meta);
    await setAllocationStatus(client, allocationId, "reversed");
    await setPaymentStatus(client, paymentId, "unallocated_amount = unallocated_amount + $2", [allocation.amount]);
    const saved = await load(client, paymentId, meta.actor, false);
    await audit(client, meta, "supplier_payments.unallocate", paymentId, `Removed an allocation from ${saved.paymentNumber}`, current, saved);
    return saved;
  });
}

export async function voidPayment(id: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (!["draft", "submitted", "approved", "rejected"].includes(current.status)) {
      throw new AppError(409, "PAYMENT_STATE", "A posted payment cannot be voided. Unallocate it and reverse it.");
    }
    await setPaymentStatus(client, id, "status = 'void', voided_at = now(), voided_by = $2", [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "supplier_payments.void", id, reason, current, saved);
    return saved;
  });
}

export async function reversePayment(id: string, input: { reason: string; postingDate?: string }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== "posted" || !current.journalEntryId) throw new AppError(409, "PAYMENT_STATE", "Only a posted payment can be reversed.");
    const separate = current.allocations.some((allocation) => allocation.status === "posted" && allocation.journalEntryId && allocation.journalEntryId !== current.journalEntryId);
    if (separate) throw new AppError(409, "PAYMENT_DEPENDENTS", "Unallocate this payment before reversing it.");
    const postingDate = input.postingDate ?? current.paymentDate;
    await reverseJournal(client, current.journalEntryId, postingDate, input.reason, meta);
    for (const allocation of current.allocations.filter((item) => item.status === "posted")) {
      await setAllocationStatus(client, allocation.id, "reversed");
    }
    await setPaymentStatus(client, id, "status = 'reversed', unallocated_amount = 0", []);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, "supplier_payments.reverse", id, input.reason, current, saved);
    return saved;
  });
}

async function applyAdvance(
  db: Sql,
  payment: { id: string; paymentNumber: string; supplierId: string; branchId: string; paymentDate: string; advanceAccountId: string | null },
  billId: string,
  amount: string,
  allocationId: string,
  meta: RequestMeta,
  apAccountId: string,
) {
  const bill = one((await lockBillOpen(db, billId)).rows, "Supplier bill not found.");
  assertBillPayable(bill, payment.supplierId, amount);
  if (!payment.advanceAccountId) throw new AppError(409, "ADVANCE_ACCOUNT", SUPPLIER_ADVANCE_SETUP);
  const journalId = await postSystemJournal(db, {
    entryNumber: await allocateNumber(db, "journal"),
    entryDate: payment.paymentDate,
    description: `Apply ${payment.paymentNumber} to ${bill.bill_number}`,
    reference: payment.paymentNumber,
    sourceType: "supplier_payment_allocation",
    sourceId: allocationId,
    createdBy: meta.actor.id,
    lines: [
      { accountId: apAccountId, branchId: bill.branch_id, description: bill.bill_number, debit: amount, credit: "0" },
      { accountId: payment.advanceAccountId, branchId: payment.branchId, description: bill.bill_number, debit: "0", credit: amount },
    ],
  });
  await markAllocationPosted(db, allocationId, journalId);
}

function assertBillPayable(bill: { status: string; supplier_id: string; open_amount: string }, supplierId: string, amount: string) {
  if (bill.status !== "posted") throw new AppError(409, "ALLOCATION", "A payment can only be applied to a posted bill. Voided and reversed bills are rejected.");
  if (bill.supplier_id !== supplierId) throw new AppError(409, "ALLOCATION", "The bill belongs to a different supplier.");
  if (decimal(amount).gt(decimal(bill.open_amount))) throw new AppError(409, "ALLOCATION", "The allocation exceeds the open bill balance.");
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

async function prepare(db: Sql, input: PaymentInput, meta: RequestMeta) {
  if (meta.actor.branchIds && !meta.actor.branchIds.includes(input.branchId)) throw new AppError(403, "BRANCH_SCOPE", "That branch is outside your access.");
  const branch = one((await selectBranch(db, input.branchId)).rows, "Branch not found.");
  if (!branch.is_active) throw new AppError(400, "VALIDATION", "The branch is inactive.");
  const supplier = one((await selectSupplierForPayment(db, input.supplierId)).rows, "Supplier not found.");
  if (!supplier.is_active) throw new AppError(400, "VALIDATION", "The supplier is inactive.");
  const cash = one((await selectCashAccount(db, input.cashAccountId)).rows, "Cash account not found.");
  if (!cash.is_active || cash.is_header || cash.account_type !== "asset") throw new AppError(400, "VALIDATION", "The payment account must be an active asset account.");
  const settings = one((await selectPurchasingSettings(db)).rows);
  if (cash.id === settings.ap_control_account_id || cash.id === settings.supplier_advance_account_id) {
    throw new AppError(400, "VALIDATION", "A supplier payment cannot use the payable control account or the supplier advance account as the cash account.");
  }
  const amount = money(input.amount);
  const billIds = input.allocations.map((line) => line.billId);
  if (new Set(billIds).size !== billIds.length) throw new AppError(400, "VALIDATION", "Each bill can be allocated once on a payment.");
  let allocated = decimal("0");
  const allocations = input.allocations.map((line) => {
    const lineAmount = money(line.amount);
    allocated = allocated.plus(lineAmount);
    return { billId: line.billId, amount: lineAmount };
  });
  const split = splitSupplierPayment(amount, money(allocated));
  return { amount, allocations, unapplied: split.unapplied, treatment: split.treatment, advanceAccountId: split.treatment === "supplier_advance" ? settings.supplier_advance_account_id : null };
}

async function assertAsset(db: Sql, id: string, message: string) {
  const account = one((await selectCashAccount(db, id)).rows, "Account not found.");
  if (!account.is_active || account.is_header || account.account_type !== "asset") throw new AppError(400, "VALIDATION", message);
}

async function transition(id: string, meta: RequestMeta, from: string, to: string, sql: string) {
  return withTransaction(async (client) => {
    const current = await load(client, id, meta.actor, true);
    if (current.status !== from) throw new AppError(409, "PAYMENT_STATE", `The payment must be ${from}.`);
    await setPaymentStatus(client, id, `status = '${to}', ${sql}`, [meta.actor.id]);
    const saved = await load(client, id, meta.actor, false);
    await audit(client, meta, `supplier_payments.${to === "submitted" ? "submit" : to}`, id, `${to} ${saved.paymentNumber}`, current, saved);
    return saved;
  });
}

async function load(db: Sql, id: string, actor: AuthUser, lock: boolean) {
  const row = one((await selectPayment(db, id, lock)).rows, "Supplier payment not found.");
  if (actor.branchIds && !actor.branchIds.includes(row.branch_id)) throw new AppError(404, "NOT_FOUND", "Supplier payment not found.");
  const allocations = await selectAllocations(db, id);
  return {
    ...mapHeader(row),
    allocations: allocations.rows.map((allocation) => ({
      id: allocation.id,
      billId: allocation.supplier_bill_id,
      billNumber: allocation.bill_number,
      amount: allocation.amount,
      status: allocation.status,
      journalEntryId: allocation.journal_entry_id,
    })),
  };
}

function mapHeader(row: {
  id: string; payment_number: string; supplier_id: string; supplier_name: string; branch_id: string; status: string;
  payment_date: string; cash_account_id: string; amount: string; unallocated_amount: string; ap_treatment: string;
  advance_account_id: string | null; notes: string | null; journal_entry_id: string | null; created_by: string;
  submitted_by: string | null; approved_by: string | null;
}) {
  return {
    id: row.id, paymentNumber: row.payment_number, supplierId: row.supplier_id, supplierName: row.supplier_name,
    branchId: row.branch_id, status: row.status, paymentDate: row.payment_date, cashAccountId: row.cash_account_id,
    amount: row.amount, unallocatedAmount: row.unallocated_amount, apTreatment: row.ap_treatment,
    advanceAccountId: row.advance_account_id, notes: row.notes, journalEntryId: row.journal_entry_id,
    createdBy: row.created_by, submittedBy: row.submitted_by, approvedBy: row.approved_by,
  };
}

function applyBranch(actor: AuthUser, where: string[], params: unknown[], column: string) {
  if (!actor.branchIds) return;
  params.push(actor.branchIds);
  where.push(`${column} = ANY($${params.length}::uuid[])`);
}

function audit(db: Sql, meta: RequestMeta, action: string, id: string, summary: string, before: unknown, after: unknown) {
  return writeAudit(db, {
    actorUserId: meta.actor.id, action, entityType: "supplier_payment", entityId: id, summary, before, after,
    ipAddress: meta.ipAddress, requestId: meta.requestId,
  });
}
