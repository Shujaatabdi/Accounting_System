import { withTransaction, query, type Sql } from "../../db/pool";
import { writeAudit } from "../../lib/audit";
import { assertIsoDate, todayInTimeZone } from "../../lib/dates";
import { AppError, one } from "../../lib/errors";
import { decimal, money } from "../../lib/money";
import { pageResult, type Page } from "../../lib/pagination";
import type { AuthUser, RequestMeta } from "../auth/types";
import { allocateNumber } from "../numbering/service";
import { assertBalanced, parseJournalLines, type DraftLineInput, type ParsedLine } from "./validation";

export type JournalInput = {
  entryDate: string;
  description: string;
  reference?: string | null;
  sourceType?: "manual" | "opening_balance";
  lines: DraftLineInput[];
};

type JournalRow = {
  id: string;
  entry_number: string;
  entry_date: string;
  posting_date: string | null;
  fiscal_period_id: string | null;
  status: string;
  description: string;
  reference: string | null;
  source_type: string;
  source_id: string | null;
  reverses_entry_id: string | null;
  reversed_by_entry_id: string | null;
  created_by: string;
  submitted_at: Date | null;
  submitted_by: string | null;
  approved_at: Date | null;
  approved_by: string | null;
  posted_at: Date | null;
  posted_by: string | null;
  voided_at: Date | null;
  voided_by: string | null;
};

type LineRow = {
  id: string;
  line_no: number;
  account_id: string;
  branch_id: string | null;
  description: string | null;
  debit: string;
  credit: string;
  account_code_snapshot: string | null;
  account_name_snapshot: string | null;
  account_code: string;
  account_name: string;
};

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
    where.push(scopeSql(params.length));
  }
  const clause = where.join(" AND ");
  const total = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM journal_entries je WHERE ${clause}`,
    params,
  );
  const rows = await query<JournalRow>(
    `SELECT ${journalColumns()}
       FROM journal_entries je
      WHERE ${clause}
      ORDER BY je.entry_date DESC, je.entry_number DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, page.offset],
  );
  return pageResult(
    rows.rows.map((row) => mapJournal(row, [])),
    Number(total.rows[0].count),
    page,
  );
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
    const entryNumber = await allocateNumber(client, "journal");
    const row = one(
      (
        await client.query<JournalRow>(
          `INSERT INTO journal_entries (entry_number, entry_date, status, description, reference, source_type, created_by)
           VALUES ($1,$2,'draft',$3,$4,$5,$6)
           RETURNING ${journalFields()}`,
          [entryNumber, input.entryDate, input.description.trim(), blank(input.reference), input.sourceType ?? "manual", meta.actor.id],
        )
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
    await client.query(
      `UPDATE journal_entries
          SET entry_date = $2, description = $3, reference = $4, source_type = $5
        WHERE id = $1`,
      [id, input.entryDate, input.description.trim(), blank(input.reference), input.sourceType ?? "manual"],
    );
    await client.query("DELETE FROM journal_lines WHERE journal_entry_id = $1", [id]);
    await insertLines(client, id, lines);
    const saved = await loadVisible(client, id, meta.actor, false);
    await writeAudit(client, event(meta, "journals.update", id, `Updated ${saved.entryNumber}`, current, saved));
    return saved;
  });
}

export async function submitJournal(id: string, meta: RequestMeta) {
  return transition(id, meta, async (client, current) => {
    if (current.status !== "draft") throw new AppError(409, "JOURNAL_STATE", "Only a draft can be submitted.");
    const lines = await lockLines(client, id);
    assertBalanced(toParsed(lines, await currencyScale(client)));
    await assertPostable(client, lines);
    await client.query(
      `UPDATE journal_entries SET status = 'pending_approval', submitted_at = now(), submitted_by = $2 WHERE id = $1`,
      [id, meta.actor.id],
    );
    return "journals.submit";
  });
}

export async function rejectJournal(id: string, reason: string, meta: RequestMeta) {
  return transition(id, meta, async (client, current) => {
    if (current.status !== "pending_approval") throw new AppError(409, "JOURNAL_STATE", "Only a submitted journal can be rejected.");
    await client.query("UPDATE journal_entries SET status = 'draft' WHERE id = $1", [id]);
    await writeAudit(client, event(meta, "journals.reject", id, reason, { status: current.status }, { status: "draft", reason }));
    return null;
  });
}

export async function approveJournal(id: string, meta: RequestMeta) {
  return transition(id, meta, async (client, current) => {
    if (current.status !== "pending_approval") throw new AppError(409, "JOURNAL_STATE", "Only a submitted journal can be approved.");
    const company = one(
      (await client.query<{ require_distinct_approver: boolean }>("SELECT require_distinct_approver FROM company WHERE id = 1")).rows,
    );
    if (company.require_distinct_approver && current.submittedBy === meta.actor.id) {
      throw new AppError(403, "SEPARATION", "A different person must approve this journal.");
    }
    const lines = await lockLines(client, id);
    assertBalanced(toParsed(lines, await currencyScale(client)));
    await assertPostable(client, lines);
    await client.query(
      `UPDATE journal_entries SET status = 'approved', approved_at = now(), approved_by = $2 WHERE id = $1`,
      [id, meta.actor.id],
    );
    return "journals.approve";
  });
}

export async function postJournal(id: string, postingDate: string | undefined, meta: RequestMeta) {
  return transition(id, meta, async (client, current) => {
    if (current.status !== "approved") throw new AppError(409, "JOURNAL_STATE", "Only an approved journal can be posted.");
    const date = postingDate ?? current.entryDate;
    assertIsoDate(date);
    const lines = await lockLines(client, id);
    assertBalanced(toParsed(lines, await currencyScale(client)));
    await assertPostable(client, lines);
    const periodId = await openPeriodId(client, date);
    await client.query(
      `UPDATE journal_lines jl
          SET account_code_snapshot = a.code, account_name_snapshot = a.name
         FROM accounts a
        WHERE jl.journal_entry_id = $1 AND a.id = jl.account_id`,
      [id],
    );
    await client.query(
      `UPDATE journal_entries
          SET status = 'posted', posting_date = $2, fiscal_period_id = $3, posted_at = now(), posted_by = $4
        WHERE id = $1`,
      [id, date, periodId, meta.actor.id],
    );
    return "journals.post";
  });
}

export async function voidJournal(id: string, reason: string, meta: RequestMeta) {
  return transition(id, meta, async (client, current) => {
    if (!["draft", "pending_approval", "approved"].includes(current.status)) {
      throw new AppError(409, "JOURNAL_STATE", "A posted journal cannot be voided. Reverse it instead.");
    }
    await client.query(
      `UPDATE journal_entries SET status = 'void', voided_at = now(), voided_by = $2 WHERE id = $1`,
      [id, meta.actor.id],
    );
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
    const company = one((await client.query<{ timezone: string }>("SELECT timezone FROM company WHERE id = 1")).rows);
    const postingDate = input.postingDate ?? todayInTimeZone(company.timezone);
    assertIsoDate(postingDate);
    const periodId = await openPeriodId(client, postingDate);
    const lines = await lockLines(client, id);
    assertLineBranches(meta.actor, lines.map((line) => ({ branchId: line.branch_id })));
    const entryNumber = await allocateNumber(client, "journal");
    const reversal = one(
      (
        await client.query<JournalRow>(
          `INSERT INTO journal_entries (
             entry_number, entry_date, status, description, reference, source_type, reverses_entry_id, created_by
           ) VALUES ($1,$2,'draft',$3,$4,'reversal',$5,$6)
           RETURNING ${journalFields()}`,
          [
            entryNumber,
            postingDate,
            `Reversal of ${original.entryNumber}: ${input.reason.trim()}`,
            original.reference ? `REV-${original.reference}` : null,
            id,
            meta.actor.id,
          ],
        )
      ).rows,
    );
    for (const line of lines) {
      await client.query(
        `INSERT INTO journal_lines (
           journal_entry_id, line_no, account_id, branch_id, description, debit, credit, account_code_snapshot, account_name_snapshot
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          reversal.id,
          line.line_no,
          line.account_id,
          line.branch_id,
          line.description,
          line.credit,
          line.debit,
          line.account_code_snapshot,
          line.account_name_snapshot,
        ],
      );
    }
    await client.query("SELECT set_config('acc.allow_system_post', 'on', true)");
    await client.query(
      `UPDATE journal_entries
          SET status = 'posted', posting_date = $2, fiscal_period_id = $3, posted_at = now(), posted_by = $4
        WHERE id = $1`,
      [reversal.id, postingDate, periodId, meta.actor.id],
    );
    await client.query("UPDATE journal_entries SET reversed_by_entry_id = $2 WHERE id = $1", [id, reversal.id]);
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
  const row = one(
    (
      await db.query<JournalRow>(
        `SELECT ${journalColumns()} FROM journal_entries je WHERE je.id = $1 ${lock ? "FOR UPDATE" : ""}`,
        [id],
      )
    ).rows,
    "Journal not found.",
  );
  if (actor.branchIds) {
    const hidden = await db.query(
      `SELECT 1 FROM journal_lines
        WHERE journal_entry_id = $1
          AND (branch_id IS NULL OR NOT (branch_id = ANY($2::uuid[])))
        LIMIT 1`,
      [id, actor.branchIds],
    );
    if ((hidden.rowCount ?? 0) > 0) throw new AppError(404, "NOT_FOUND", "Journal not found.");
  }
  const lines = await db.query<LineRow>(
    `SELECT jl.id, jl.line_no, jl.account_id, jl.branch_id, jl.description, jl.debit::text AS debit, jl.credit::text AS credit,
            jl.account_code_snapshot, jl.account_name_snapshot, a.code AS account_code, a.name AS account_name
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
      WHERE jl.journal_entry_id = $1
      ORDER BY jl.line_no`,
    [id],
  );
  return mapJournal(row, lines.rows);
}

async function lockLines(db: Sql, id: string) {
  const lines = await db.query<LineRow>(
    `SELECT jl.id, jl.line_no, jl.account_id, jl.branch_id, jl.description, jl.debit::text AS debit, jl.credit::text AS credit,
            jl.account_code_snapshot, jl.account_name_snapshot, a.code AS account_code, a.name AS account_name
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
      WHERE jl.journal_entry_id = $1
      ORDER BY jl.line_no
      FOR UPDATE OF jl`,
    [id],
  );
  return lines.rows;
}

async function insertLines(db: Sql, journalId: string, lines: ParsedLine[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    await db.query(
      `INSERT INTO journal_lines (journal_entry_id, line_no, account_id, branch_id, description, debit, credit)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [journalId, index + 1, line.accountId, line.branchId, line.description, money(line.debit), money(line.credit)],
    );
  }
}

async function assertAccountsAndBranches(db: Sql, lines: ParsedLine[]) {
  await assertPostable(
    db,
    lines.map((line) => ({ account_id: line.accountId, branch_id: line.branchId })),
  );
}

async function assertPostable(db: Sql, lines: Array<{ account_id: string; branch_id: string | null }>) {
  const accountIds = [...new Set(lines.map((line) => line.account_id))];
  const accounts = await db.query<{ id: string; is_header: boolean; is_active: boolean; has_children: boolean }>(
    `SELECT a.id, a.is_header, a.is_active,
            EXISTS (SELECT 1 FROM accounts c WHERE c.parent_id = a.id) AS has_children
       FROM accounts a WHERE a.id = ANY($1::uuid[]) FOR SHARE`,
    [accountIds],
  );
  if (accounts.rows.length !== accountIds.length) throw new AppError(400, "VALIDATION", "A journal line uses an unknown account.");
  if (accounts.rows.some((account) => !account.is_active || account.is_header || account.has_children)) {
    throw new AppError(400, "ACCOUNT_NOT_POSTABLE", "Journals can only use active accounts that are not headers.");
  }
  const branchIds = [...new Set(lines.flatMap((line) => (line.branch_id ? [line.branch_id] : [])))];
  if (branchIds.length === 0) return;
  const branches = await db.query<{ id: string; is_active: boolean }>(
    "SELECT id, is_active FROM branches WHERE id = ANY($1::uuid[])",
    [branchIds],
  );
  if (branches.rows.length !== branchIds.length || branches.rows.some((branch) => !branch.is_active)) {
    throw new AppError(400, "VALIDATION", "A journal line uses an unknown or inactive branch.");
  }
}

async function openPeriodId(db: Sql, postingDate: string) {
  const period = (
    await db.query<{ id: string; status: string; year_status: string }>(
      `SELECT p.id, p.status, y.status AS year_status
         FROM fiscal_periods p
         JOIN fiscal_years y ON y.id = p.fiscal_year_id
        WHERE p.start_date <= $1::date AND p.end_date >= $1::date
        FOR UPDATE OF p, y`,
      [postingDate],
    )
  ).rows[0];
  if (!period) throw new AppError(400, "NO_PERIOD", "No fiscal period covers that posting date.");
  if (period.status !== "open" || period.year_status !== "open") {
    throw new AppError(409, "PERIOD_CLOSED", "That posting date is in a closed period or fiscal year.");
  }
  return period.id;
}

async function currencyScale(db: Sql = { query }) {
  const company = one(
    (await db.query<{ currency_decimal_places: number }>("SELECT currency_decimal_places FROM company WHERE id = 1")).rows,
  );
  return company.currency_decimal_places;
}

function assertLineBranches(actor: AuthUser, lines: Array<{ branchId: string | null }>) {
  if (actor.branchIds === null) return;
  if (lines.some((line) => !line.branchId || !actor.branchIds?.includes(line.branchId))) {
    throw new AppError(403, "BRANCH_SCOPE", "Every line must use a branch assigned to you.");
  }
}

function toParsed(lines: LineRow[], scale: number): ParsedLine[] {
  return parseJournalLines(
    lines.map((line) => ({
      accountId: line.account_id,
      branchId: line.branch_id,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
    })),
    scale,
  );
}

function scopeSql(index: number) {
  return `EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.journal_entry_id = je.id)
    AND NOT EXISTS (
      SELECT 1 FROM journal_lines jl
       WHERE jl.journal_entry_id = je.id
         AND (jl.branch_id IS NULL OR NOT (jl.branch_id = ANY($${index}::uuid[])))
    )`;
}

function journalFields() {
  return `id, entry_number, entry_date, posting_date, fiscal_period_id, status, description,
          reference, source_type, source_id, reverses_entry_id, reversed_by_entry_id, created_by,
          submitted_at, submitted_by, approved_at, approved_by, posted_at, posted_by, voided_at, voided_by`;
}

function journalColumns() {
  return journalFields()
    .split(",")
    .map((field) => `je.${field.trim()}`)
    .join(", ");
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
