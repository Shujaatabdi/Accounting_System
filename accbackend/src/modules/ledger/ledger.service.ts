import type { Sql } from "../../db/pool";
import { AppError } from "../../shared/errors";
import { one } from "../../shared/errors";
import { selectCurrencyScale } from "../company/company.repository";
import { assertBalanced, parseJournalLines, type ParsedLine } from "../journals/journals.validation";
import {
  allowSystemPost,
  insertReversalLine,
  lockLines,
  lockOpenPeriod,
  lockPostableAccounts,
  markPosted,
  selectActiveBranches,
  snapshotLineAccounts,
  type LineRow,
} from "./ledger.repository";

export async function lockEntryLines(db: Sql, journalId: string) {
  return (await lockLines(db, journalId)).rows;
}

export { allowSystemPost, markPosted, markReversedBy } from "./ledger.repository";

export async function preparePosting(db: Sql, journalId: string) {
  const lines = (await lockLines(db, journalId)).rows;
  assertBalanced(toParsed(lines, await currencyScale(db)));
  await assertPostable(db, lines);
  return lines;
}

export async function postPreparedJournal(
  db: Sql,
  input: { journalId: string; postingDate: string; postedBy: string; system: boolean },
) {
  const periodId = await openPeriodId(db, input.postingDate);
  await snapshotLineAccounts(db, input.journalId);
  if (input.system) await allowSystemPost(db);
  await markPosted(db, input.journalId, input.postingDate, periodId, input.postedBy);
  return periodId;
}

export async function openPeriodId(db: Sql, postingDate: string) {
  const period = (await lockOpenPeriod(db, postingDate)).rows[0];
  if (!period) throw new AppError(400, "NO_PERIOD", "No fiscal period covers that posting date.");
  if (period.status !== "open" || period.year_status !== "open") {
    throw new AppError(409, "PERIOD_CLOSED", "That posting date is in a closed period or fiscal year.");
  }
  return period.id;
}

export async function insertReversalLines(db: Sql, reversalId: string, lines: LineRow[]) {
  for (const line of lines) {
    await insertReversalLine(db, [
      reversalId,
      line.line_no,
      line.account_id,
      line.branch_id,
      line.description,
      line.credit,
      line.debit,
      line.account_code_snapshot,
      line.account_name_snapshot,
    ]);
  }
}

async function assertPostable(db: Sql, lines: Array<{ account_id: string; branch_id: string | null }>) {
  const accountIds = [...new Set(lines.map((line) => line.account_id))];
  const accounts = await lockPostableAccounts(db, accountIds);
  if (accounts.rows.length !== accountIds.length) throw new AppError(400, "VALIDATION", "A journal line uses an unknown account.");
  if (accounts.rows.some((account) => !account.is_active || account.is_header || account.has_children)) {
    throw new AppError(400, "ACCOUNT_NOT_POSTABLE", "Journals can only use active accounts that are not headers.");
  }
  const branchIds = [...new Set(lines.flatMap((line) => (line.branch_id ? [line.branch_id] : [])))];
  if (branchIds.length === 0) return;
  const branches = await selectActiveBranches(db, branchIds);
  if (branches.rows.length !== branchIds.length || branches.rows.some((branch) => !branch.is_active)) {
    throw new AppError(400, "VALIDATION", "A journal line uses an unknown or inactive branch.");
  }
}

export async function assertAccountsAndBranches(db: Sql, lines: ParsedLine[]) {
  await assertPostable(
    db,
    lines.map((line) => ({ account_id: line.accountId, branch_id: line.branchId })),
  );
}

async function currencyScale(db: Sql) {
  const company = one((await selectCurrencyScale(db)).rows);
  return company.currency_decimal_places;
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
