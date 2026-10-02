import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { AppError, one } from "../../shared/errors";
import { pageResult, type Page } from "../../shared/http/pagination";
import type { RequestMeta } from "../auth/auth.types";
import { normalBalanceFor, type AccountType } from "../reports/reports.calculations";
import {
  childExists,
  countAccounts,
  deleteAccountRow,
  findAccount,
  insertAccount,
  lineExists,
  lockAccount,
  lockAccountHeader,
  saveAccount,
  selectAccounts,
  selectParentId,
} from "./accounts.repository";
import type { AccountInput } from "./accounts.types";

type AccountRow = {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  account_subtype: string | null;
  parent_id: string | null;
  parent_code: string | null;
  is_header: boolean;
  is_control: boolean;
  is_active: boolean;
  is_system: boolean;
  normal_balance: "debit" | "credit";
  description: string | null;
};

export async function listAccounts(page: Page, search?: string, postable?: boolean) {
  const term = search?.replace(/[%_]/g, "").trim();
  const filters = ["TRUE"];
  const params: unknown[] = [];
  if (term) {
    params.push(`%${term}%`);
    filters.push(`(a.code ILIKE $${params.length} OR a.name ILIKE $${params.length})`);
  }
  if (postable) {
    filters.push("a.is_active AND NOT a.is_header AND NOT EXISTS (SELECT 1 FROM accounts c WHERE c.parent_id = a.id)");
  }
  const where = filters.join(" AND ");
  const total = await countAccounts({ query }, where, params);
  const rows = await selectAccounts({ query }, where, [...params, page.pageSize, page.offset]);
  return pageResult(rows.rows.map((row) => mapAccount(row as AccountRow)), Number(total.rows[0].count), page);
}

export async function createAccount(input: AccountInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    await assertParent(client, input);
    const account = mapAccount(one((await insertAccount(client, values(input))).rows));
    await writeAudit(client, event(meta, "accounts.create", account.id, "Created account", null, account));
    return account;
  });
}

export async function updateAccount(id: string, input: AccountInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const existing = one(
      (await lockAccount(client, id)).rows,
      "Account not found.",
    ) as AccountRow & { line_count: string };
    if (existing.is_system && !input.isActive) {
      throw new AppError(409, "SYSTEM_ACCOUNT", "A system account cannot be deactivated.");
    }
    const hasLines = existing.line_count !== "0";
    if (hasLines && (existing.code !== input.code.trim() || existing.account_type !== input.accountType)) {
      throw new AppError(409, "ACCOUNT_USED", "Code and account type cannot change after journal lines exist.");
    }
    if (hasLines && input.isHeader) {
      throw new AppError(409, "ACCOUNT_USED", "An account with journal lines cannot become a header.");
    }
    const children = await childExists(client, id);
    if ((children.rowCount ?? 0) > 0 && !input.isHeader) {
      throw new AppError(409, "HAS_CHILDREN", "An account with child accounts must stay a header.");
    }
    await assertParent(client, input, id);
    const after = mapAccount(one((await saveAccount(client, id, values(input))).rows));
    const before = mapAccount(existing);
    await writeAudit(client, event(meta, "accounts.update", id, "Updated account", before, after));
    return after;
  });
}

export async function deleteAccount(id: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const existing = one((await lockAccountHeader(client, id)).rows, "Account not found.") as AccountRow;
    if (existing.is_system) throw new AppError(409, "SYSTEM_ACCOUNT", "A system account cannot be deleted.");
    const used = await lineExists(client, id);
    if ((used.rowCount ?? 0) > 0) throw new AppError(409, "ACCOUNT_USED", "Deactivate an account that already has journal lines.");
    const children = await childExists(client, id);
    if ((children.rowCount ?? 0) > 0) throw new AppError(409, "HAS_CHILDREN", "Remove child accounts first.");
    await deleteAccountRow(client, id);
    await writeAudit(client, event(meta, "accounts.delete", id, "Deleted account", mapAccount(existing), null));
    return { deleted: true };
  });
}

async function assertParent(db: Sql, input: AccountInput, selfId?: string) {
  if (!input.parentId) return;
  if (input.parentId === selfId) throw new AppError(400, "VALIDATION", "An account cannot be its own parent.");
  const parent = one((await findAccount(db, input.parentId)).rows, "Parent account not found.") as AccountRow;
  if (parent.account_type !== input.accountType) {
    throw new AppError(400, "VALIDATION", "A child account must use the same account type as its parent.");
  }
  if (!parent.is_header) throw new AppError(400, "VALIDATION", "The parent account must be a header.");
  const lines = await lineExists(db, input.parentId);
  if ((lines.rowCount ?? 0) > 0) {
    throw new AppError(409, "ACCOUNT_USED", "An account with journal lines cannot become a parent.");
  }
  let cursor: string | null = parent.parent_id;
  const seen = new Set<string>([input.parentId]);
  while (cursor) {
    if (cursor === selfId || seen.has(cursor)) {
      throw new AppError(400, "VALIDATION", "That parent would create a cycle.");
    }
    seen.add(cursor);
    const next = await selectParentId(db, cursor);
    cursor = next.rows[0]?.parent_id ?? null;
  }
}

function values(input: AccountInput) {
  return [
    input.code.trim(),
    input.name.trim(),
    input.accountType,
    blank(input.accountSubtype),
    input.parentId ?? null,
    input.isHeader,
    input.isControl,
    input.isActive,
    normalBalanceFor(input.accountType),
    blank(input.description),
  ];
}

function mapAccount(row: AccountRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    accountType: row.account_type,
    accountSubtype: row.account_subtype,
    parentId: row.parent_id,
    parentCode: row.parent_code,
    isHeader: row.is_header,
    isControl: row.is_control,
    isActive: row.is_active,
    isSystem: row.is_system,
    normalBalance: row.normal_balance,
    description: row.description,
  };
}

function blank(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function event(meta: RequestMeta, action: string, id: string, summary: string, before: unknown, after: unknown) {
  return {
    actorUserId: meta.actor.id,
    action,
    entityType: "account",
    entityId: id,
    summary,
    before,
    after,
    ipAddress: meta.ipAddress,
    requestId: meta.requestId,
  };
}
