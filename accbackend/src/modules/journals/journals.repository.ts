import type { Sql } from "../../db/pool";
import type { LineRow } from "../ledger/ledger.repository";

export type JournalRow = {
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

export function journalFields() {
  return `id, entry_number, entry_date, posting_date, fiscal_period_id, status, description,
          reference, source_type, source_id, reverses_entry_id, reversed_by_entry_id, created_by,
          submitted_at, submitted_by, approved_at, approved_by, posted_at, posted_by, voided_at, voided_by`;
}

export function journalColumns() {
  return journalFields()
    .split(",")
    .map((field) => `je.${field.trim()}`)
    .join(", ");
}

export async function countJournals(db: Sql, clause: string, params: unknown[]) {
  return db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM journal_entries je WHERE ${clause}`, params);
}

export async function selectJournals(db: Sql, clause: string, params: unknown[]) {
  return db.query<JournalRow>(
    `SELECT ${journalColumns()} FROM journal_entries je WHERE ${clause}
      ORDER BY je.entry_date DESC, je.entry_number DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function selectJournal(db: Sql, id: string, lock: boolean) {
  return db.query<JournalRow>(
    `SELECT ${journalColumns()} FROM journal_entries je WHERE je.id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [id],
  );
}

export async function openingArUnbalanced(db: Sql, journalId: string) {
  return db.query(
    `SELECT 1
       FROM journal_lines jl
       JOIN sales_settings s ON s.id = 1
      WHERE jl.journal_entry_id = $1
        AND s.ar_control_account_id IS NOT NULL
        AND jl.account_id = s.ar_control_account_id
        AND (jl.debit - jl.credit) <> COALESCE((
          SELECT SUM(d.amount) FROM customer_opening_details d WHERE d.journal_line_id = jl.id
        ), 0)`,
    [journalId],
  );
}

export async function openingApUnbalanced(db: Sql, journalId: string) {
  return db.query(
    `SELECT 1
       FROM journal_lines jl
       JOIN purchasing_settings s ON s.id = 1
      WHERE jl.journal_entry_id = $1
        AND s.ap_control_account_id IS NOT NULL
        AND jl.account_id = s.ap_control_account_id
        AND (jl.credit - jl.debit) <> COALESCE((
          SELECT SUM(d.amount) FROM supplier_opening_details d WHERE d.journal_line_id = jl.id
        ), 0)`,
    [journalId],
  );
}

export async function hiddenBranchLine(db: Sql, id: string, branchIds: string[]) {
  return db.query(
    `SELECT 1 FROM journal_lines
      WHERE journal_entry_id = $1
        AND (branch_id IS NULL OR NOT (branch_id = ANY($2::uuid[])))
      LIMIT 1`,
    [id, branchIds],
  );
}

export async function selectLines(db: Sql, id: string) {
  return db.query<LineRow>(
    `SELECT jl.id, jl.line_no, jl.account_id, jl.branch_id, jl.description, jl.debit::text AS debit, jl.credit::text AS credit,
            jl.account_code_snapshot, jl.account_name_snapshot, a.code AS account_code, a.name AS account_name
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
      WHERE jl.journal_entry_id = $1
      ORDER BY jl.line_no`,
    [id],
  );
}

export async function insertJournal(db: Sql, values: unknown[]) {
  return db.query<JournalRow>(
    `INSERT INTO journal_entries (entry_number, entry_date, status, description, reference, source_type, created_by)
     VALUES ($1,$2,'draft',$3,$4,$5,$6)
     RETURNING ${journalFields()}`,
    values,
  );
}

export async function insertReversalJournal(db: Sql, values: unknown[]) {
  return db.query<JournalRow>(
    `INSERT INTO journal_entries (
       entry_number, entry_date, status, description, reference, source_type, reverses_entry_id, created_by
     ) VALUES ($1,$2,'draft',$3,$4,'reversal',$5,$6)
     RETURNING ${journalFields()}`,
    values,
  );
}

export async function updateDraft(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE journal_entries
        SET entry_date = $2, description = $3, reference = $4, source_type = $5
      WHERE id = $1`,
    [id, ...values],
  );
}

export async function deleteLines(db: Sql, journalId: string) {
  await db.query("DELETE FROM journal_lines WHERE journal_entry_id = $1", [journalId]);
}

export async function insertLine(db: Sql, values: unknown[]) {
  await db.query(
    `INSERT INTO journal_lines (journal_entry_id, line_no, account_id, branch_id, description, debit, credit)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    values,
  );
}

export async function markSubmitted(db: Sql, id: string, userId: string) {
  await db.query(
    `UPDATE journal_entries SET status = 'pending_approval', submitted_at = now(), submitted_by = $2 WHERE id = $1`,
    [id, userId],
  );
}

export async function markDraft(db: Sql, id: string) {
  await db.query("UPDATE journal_entries SET status = 'draft' WHERE id = $1", [id]);
}

export async function markApproved(db: Sql, id: string, userId: string) {
  await db.query(
    `UPDATE journal_entries SET status = 'approved', approved_at = now(), approved_by = $2 WHERE id = $1`,
    [id, userId],
  );
}

export async function markVoid(db: Sql, id: string, userId: string) {
  await db.query(
    `UPDATE journal_entries SET status = 'void', voided_at = now(), voided_by = $2 WHERE id = $1`,
    [id, userId],
  );
}

export function branchScopeSql(index: number) {
  return `EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.journal_entry_id = je.id)
    AND NOT EXISTS (
      SELECT 1 FROM journal_lines jl
       WHERE jl.journal_entry_id = je.id
         AND (jl.branch_id IS NULL OR NOT (jl.branch_id = ANY($${index}::uuid[])))
    )`;
}
