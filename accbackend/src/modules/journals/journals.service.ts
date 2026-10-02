import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { assertIsoDate, todayInTimeZone } from "../../shared/dates";
import { AppError, one } from "../../shared/errors";
import { decimal, money } from "../../shared/money";
import { pageResult, type Page } from "../../shared/http/pagination";
import type { AuthUser, RequestMeta } from "../auth/auth.types";
import { selectCurrencyScale, selectRequireDistinctApprover, selectTimezone } from "../company/company.repository";
import { selectSalesSettings } from "../company/sales.repository";
import { allocateNumber } from "../company/numbering.service";
import {
  allowSystemPost,
  assertAccountsAndBranches,
  insertReversalLines,
  lockEntryLines,
  markPosted,
  markReversedBy,
  openPeriodId,
  postPreparedJournal,
  preparePosting,
} from "../ledger/ledger.service";
import { parseJournalLines, type ParsedLine } from "./journals.validation";
import {
  branchScopeSql,
  countJournals,
  deleteLines,
  hiddenBranchLine,
  insertJournal,
  insertLine,
  insertReversalJournal,
  markApproved,
  markDraft,
  markSubmitted,
  markVoid,
  openingArUnbalanced,
  selectJournal,
  selectJournals,
  selectLines,
  updateDraft,
  type JournalRow,
} from "./journals.repository";
import type { LineRow } from "../ledger/ledger.repository";
import type { JournalInput } from "./journals.types";

export async function listJournals(
  actor: AuthUser,
  page: Page,
  filters: { status?: string; from?: string; to?: string; search?: string },
) {
  const params: unknown[] = [];
  const where = ["TRUE"];
  if (filters.status) {
    params.push(filters.status);
    where.push(`je.status = $${params.length}`);
  }
  if (filters.from) {
    assertIsoDate(filters.from);
    params.push(filters.from);
    where.push(`je.entry_date >= $${params.length}::date`);
  }
  if (filters.to) {
    assertIsoDate(filters.to);
    params.push(filters.to);
    where.push(`je.entry_date <= $${params.length}::date`);
  }
  if (filters.search) {
    params.push(`%${filters.search.replace(/[%_]/g, "").trim()}%`);
    where.push(`(je.entry_number ILIKE $${params.length} OR je.description ILIKE $${params.length})`);
  }
  if (actor.branchIds) {
    params.push(actor.branchIds);
    where.push(branchScopeSql(params.length));
  }
  const clause = where.join(" AND ");
  const total = await countJournals({ query }, clause, params);
  const rows = await selectJournals({ query }, clause, [...params, page.pageSize, page.offset]);
  return pageResult(rows.rows.map((row) => mapJournal(row, [])), Number(total.rows[0].count), page);
}

export async function getJournal(id: string, actor: AuthUser) {
  return withTransaction(async (client) => loadVisible(client, id, actor, false));
}

export async function createJournal(input: JournalInput, meta: RequestMeta) {
  assertIsoDate(input.entryDate);
  const lines = parseJournalLines(input.lines, await currencyScale());
  assertLineBranches(meta.actor, lines);
  return withTransaction(async (client) => {
    await assertAccountsAndBranches(client, lines);
    await assertManualArAllowed(client, input.sourceType ?? "manual", lines);
    const entryNumber = await allocateNumber(client, "journal");
    const row = one(
      (
        await insertJournal(client, [
          entryNumber,
          input.entryDate,
          input.description.trim(),
          blank(input.reference),
          input.sourceType ?? "manual",
          meta.actor.id,
        ])
      ).rows,
    );
    await insertLines(client, row.id, lines);
    const saved = await loadVisible(client, row.id, meta.actor, false);
    await writeAudit(client, event(meta, "journals.create", row.id, `Created ${entryNumber}`, null, saved));
    return saved;
  });
}

export async function updateJournal(id: string, input: JournalInput, meta: RequestMeta) {
  assertIsoDate(input.entryDate);
  const lines = parseJournalLines(input.lines, await currencyScale());
  assertLineBranches(meta.actor, lines);
  return withTransaction(async (client) => {
    const current = await loadVisible(client, id, meta.actor, true);
    if (current.status !== "draft") throw new AppError(409, "NOT_DRAFT", "Only a draft journal can be edited.");
    await assertAccountsAndBranches(client, lines);
    await assertManualArAllowed(client, input.sourceType ?? "manual", lines);
    await updateDraft(client, id, [input.entryDate, input.description.trim(), blank(input.reference), input.sourceType ?? "manual"]);
    await deleteLines(client, id);
    await insertLines(client, id, lines);
    const saved = await loadVisible(client, id, meta.actor, false);
    await writeAudit(client, event(meta, "journals.update", id, `Updated ${saved.entryNumber}`, current, saved));
    return saved;
  });
}

export async function submitJournal(id: string, meta: RequestMeta) {
  return transition(id, meta, async (client, current) => {
    if (current.status !== "draft") throw new AppError(409, "JOURNAL_STATE", "Only a draft can be submitted.");
    await assertOpeningArReady(client, current.sourceType, id);
    await preparePosting(client, id);
    await markSubmitted(client, id, meta.actor.id);
    return "journals.submit";
  });
}

export async function rejectJournal(id: string, reason: string, meta: RequestMeta) {
  return transition(id, meta, async (client, current) => {
    if (current.status !== "pending_approval") throw new AppError(409, "JOURNAL_STATE", "Only a submitted journal can be rejected.");
    await markDraft(client, id);
    await writeAudit(client, event(meta, "journals.reject", id, reason, { status: current.status }, { status: "draft", reason }));
    return null;
  });
}

export async function approveJournal(id: string, meta: RequestMeta) {
  return transition(id, meta, async (client, current) => {
    if (current.status !== "pending_approval") throw new AppError(409, "JOURNAL_STATE", "Only a submitted journal can be approved.");
    const company = one((await selectRequireDistinctApprover(client)).rows);
    if (company.require_distinct_approver && current.submittedBy === meta.actor.id) {
      throw new AppError(403, "SEPARATION", "A different person must approve this journal.");
    }
    await assertOpeningArReady(client, current.sourceType, id);
    await preparePosting(client, id);
    await markApproved(client, id, meta.actor.id);
    return "journals.approve";
  });
}

export async function postJournal(id: string, postingDate: string | undefined, meta: RequestMeta) {
  return transition(id, meta, async (client, current) => {
    if (current.status !== "approved") throw new AppError(409, "JOURNAL_STATE", "Only an approved journal can be posted.");
    const date = postingDate ?? current.entryDate;
    assertIsoDate(date);
    await assertOpeningArReady(client, current.sourceType, id);
    await preparePosting(client, id);
    await postPreparedJournal(client, { journalId: id, postingDate: date, postedBy: meta.actor.id, system: false });
    return "journals.post";
  });
}

export async function voidJournal(id: string, reason: string, meta: RequestMeta) {
  return transition(id, meta, async (client, current) => {
    if (!["draft", "pending_approval", "approved"].includes(current.status)) {
      throw new AppError(409, "JOURNAL_STATE", "A posted journal cannot be voided. Reverse it instead.");
    }
    await markVoid(client, id, meta.actor.id);
    await writeAudit(client, event(meta, "journals.void", id, reason, { status: current.status }, { status: "void", reason }));
    return null;
  });
}

export async function reverseJournal(id: string, input: { postingDate?: string; reason: string }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const original = await loadVisible(client, id, meta.actor, true);
    if (original.status !== "posted" || original.reversedByEntryId) {
      throw new AppError(409, "JOURNAL_STATE", "Only a posted journal that has not already been reversed can be reversed.");
    }
    if (["invoice", "receipt", "receipt_allocation", "customer_return"].includes(original.sourceType)) {
      throw new AppError(409, "DOCUMENT_REVERSAL", "Reverse the source document. Its journal cannot be reversed on its own.");
    }
    const company = one((await selectTimezone(client)).rows);
    const postingDate = input.postingDate ?? todayInTimeZone(company.timezone);
    assertIsoDate(postingDate);
    const periodId = await openPeriodId(client, postingDate);
    const lines = await lockEntryLines(client, id);
    assertLineBranches(meta.actor, lines.map((line) => ({ branchId: line.branch_id })));
    const entryNumber = await allocateNumber(client, "journal");
    const reversal = one(
      (
        await insertReversalJournal(client, [
          entryNumber,
          postingDate,
          `Reversal of ${original.entryNumber}: ${input.reason.trim()}`,
          original.reference ? `REV-${original.reference}` : null,
          id,
          meta.actor.id,
        ])
      ).rows,
    );
    await insertReversalLines(client, reversal.id, lines);
    await allowSystemPost(client);
    await markPosted(client, reversal.id, postingDate, periodId, meta.actor.id);
    await markReversedBy(client, id, reversal.id);
    const saved = await loadVisible(client, reversal.id, meta.actor, false);
    await writeAudit(client, event(meta, "journals.reverse", id, input.reason, { entryNumber: original.entryNumber }, saved));
    return saved;
  });
}

async function transition(
  id: string,
  meta: RequestMeta,
  change: (client: Sql, current: ReturnType<typeof mapJournal>) => Promise<string | null>,
) {
  return withTransaction(async (client) => {
    const current = await loadVisible(client, id, meta.actor, true);
    const action = await change(client, current);
    const saved = await loadVisible(client, id, meta.actor, false);
    if (action) await writeAudit(client, event(meta, action, id, `${action} ${saved.entryNumber}`, current, saved));
    return saved;
  });
}

async function loadVisible(db: Sql, id: string, actor: AuthUser, lock: boolean) {
  const row = one((await selectJournal(db, id, lock)).rows, "Journal not found.");
  if (actor.branchIds) {
    const hidden = await hiddenBranchLine(db, id, actor.branchIds);
    if ((hidden.rowCount ?? 0) > 0) throw new AppError(404, "NOT_FOUND", "Journal not found.");
  }
  const lines = await selectLines(db, id);
  return mapJournal(row, lines.rows);
}

async function insertLines(db: Sql, journalId: string, lines: ParsedLine[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    await insertLine(db, [journalId, index + 1, line.accountId, line.branchId, line.description, money(line.debit), money(line.credit)]);
  }
}

async function currencyScale(db: Sql = { query }) {
  const company = one((await selectCurrencyScale(db)).rows);
  return company.currency_decimal_places;
}

async function assertManualArAllowed(db: Sql, sourceType: string, lines: ParsedLine[]) {
  if (sourceType === "opening_balance") return;
  const settings = (await selectSalesSettings(db)).rows[0];
  const control = settings?.ar_control_account_id;
  if (control && lines.some((line) => line.accountId === control)) {
    throw new AppError(409, "AR_CONTROL", "Manual journals cannot post to the customer receivable control account.");
  }
}

async function assertOpeningArReady(db: Sql, sourceType: string, journalId: string) {
  if (sourceType !== "opening_balance") return;
  const mismatch = await openingArUnbalanced(db, journalId);
  if ((mismatch.rowCount ?? 0) > 0) {
    throw new AppError(409, "OPENING_AR", "Customer opening detail must equal the accounts receivable line before this journal can continue.");
  }
}

function assertLineBranches(actor: AuthUser, lines: Array<{ branchId: string | null }>) {
  if (actor.branchIds === null) return;
  if (lines.some((line) => !line.branchId || !actor.branchIds?.includes(line.branchId))) {
    throw new AppError(403, "BRANCH_SCOPE", "Every line must use a branch assigned to you.");
  }
}

function mapJournal(row: JournalRow, lines: LineRow[]) {
  const debit = lines.reduce((sum, line) => sum.plus(decimal(line.debit)), decimal("0"));
  const credit = lines.reduce((sum, line) => sum.plus(decimal(line.credit)), decimal("0"));
  return {
    id: row.id,
    entryNumber: row.entry_number,
    entryDate: row.entry_date,
    postingDate: row.posting_date,
    fiscalPeriodId: row.fiscal_period_id,
    status: row.status,
    description: row.description,
    reference: row.reference,
    sourceType: row.source_type,
    sourceId: row.source_id,
    reversesEntryId: row.reverses_entry_id,
    reversedByEntryId: row.reversed_by_entry_id,
    createdBy: row.created_by,
    submittedAt: iso(row.submitted_at),
    submittedBy: row.submitted_by,
    approvedAt: iso(row.approved_at),
    approvedBy: row.approved_by,
    postedAt: iso(row.posted_at),
    postedBy: row.posted_by,
    voidedAt: iso(row.voided_at),
    voidedBy: row.voided_by,
    lines: lines.map((line) => ({
      id: line.id,
      lineNo: line.line_no,
      accountId: line.account_id,
      accountCode: line.account_code_snapshot ?? line.account_code,
      accountName: line.account_name_snapshot ?? line.account_name,
      branchId: line.branch_id,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
    })),
    totalDebit: money(debit),
    totalCredit: money(credit),
  };
}

function iso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function blank(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function event(meta: RequestMeta, action: string, id: string, summary: string, before: unknown, after: unknown) {
  return {
    actorUserId: meta.actor.id,
    action,
    entityType: "journal_entry",
    entityId: id,
    summary,
    before,
    after,
    ipAddress: meta.ipAddress,
    requestId: meta.requestId,
  };
}
