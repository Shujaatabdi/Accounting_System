import { query, withTransaction, type Sql } from "../../db/pool";
import { writeAudit } from "../../lib/audit";
import { AppError, one } from "../../lib/errors";
import { pageResult, type Page } from "../../lib/pagination";
import type { RequestMeta } from "../auth/types";
import { normalBalanceFor, type AccountType } from "../reports/calculations";

export type AccountInput = {
  code: string;
  name: string;
  accountType: AccountType;
  accountSubtype?: string | null;
  parentId?: string | null;
  isHeader: boolean;
  isControl: boolean;
  isActive: boolean;
  description?: string | null;
};

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
  const total = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM accounts a WHERE ${where}`,
    params,
  );
  const rows = await query<AccountRow>(
    `${accountSelect()} WHERE ${where} ORDER BY a.code LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, page.offset],
  );
  return pageResult(rows.rows.map(mapAccount), Number(total.rows[0].count), page);
}

export async function createAccount(input: AccountInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    await assertParent(client, input);
    const row = one(
      (
        await client.query<AccountRow>(
          `INSERT INTO accounts (
             code, name, account_type, account_subtype, parent_id, is_header, is_control, is_active, normal_balance, description
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING ${accountReturning()}`,
          values(input),
        )
      ).rows,
    );
    const account = mapAccount(row);
    await writeAudit(client, event(meta, "accounts.create", account.id, "Created account", null, account));
    return account;
  });
}

export async function updateAccount(id: string, input: AccountInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const existing = one(
      (await client.query<AccountRow & { line_count: string }>(
        `SELECT ${accountColumns()},
                (SELECT COUNT(*)::text FROM journal_lines jl WHERE jl.account_id = a.id) AS line_count
           FROM accounts a
           LEFT JOIN accounts parent ON parent.id = a.parent_id
          WHERE a.id = $1
          FOR UPDATE OF a`,
        [id],
      )).rows,
      "Account not found.",
    );
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
    const children = await client.query("SELECT 1 FROM accounts WHERE parent_id = $1 LIMIT 1", [id]);
    if ((children.rowCount ?? 0) > 0 && !input.isHeader) {
      throw new AppError(409, "HAS_CHILDREN", "An account with child accounts must stay a header.");
    }
    await assertParent(client, input, id);
    const row = one(
      (
        await client.query<AccountRow>(
          `UPDATE accounts SET
             code=$2, name=$3, account_type=$4, account_subtype=$5, parent_id=$6,
             is_header=$7, is_control=$8, is_active=$9, normal_balance=$10, description=$11
           WHERE id=$1
           RETURNING ${accountReturning()}`,
          [id, ...values(input)],
        )
      ).rows,
    );
    const before = mapAccount(existing);
    const after = mapAccount(row);
    await writeAudit(client, event(meta, "accounts.update", id, "Updated account", before, after));
    return after;
  });
}

export async function deleteAccount(id: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const existing = one(
      (await client.query<AccountRow>(`${accountSelect()} WHERE a.id = $1 FOR UPDATE OF a`, [id])).rows,
      "Account not found.",
    );
    if (existing.is_system) throw new AppError(409, "SYSTEM_ACCOUNT", "A system account cannot be deleted.");
    const used = await client.query("SELECT 1 FROM journal_lines WHERE account_id = $1 LIMIT 1", [id]);
    if ((used.rowCount ?? 0) > 0) throw new AppError(409, "ACCOUNT_USED", "Deactivate an account that already has journal lines.");
    const children = await client.query("SELECT 1 FROM accounts WHERE parent_id = $1 LIMIT 1", [id]);
    if ((children.rowCount ?? 0) > 0) throw new AppError(409, "HAS_CHILDREN", "Remove child accounts first.");
    await client.query("DELETE FROM accounts WHERE id = $1", [id]);
    await writeAudit(client, event(meta, "accounts.delete", id, "Deleted account", mapAccount(existing), null));
    return { deleted: true };
  });
}

async function assertParent(db: Sql, input: AccountInput, selfId?: string) {
  if (!input.parentId) return;
  if (input.parentId === selfId) throw new AppError(400, "VALIDATION", "An account cannot be its own parent.");
  const parent = one(
    (await db.query<AccountRow>(`${accountSelect()} WHERE a.id = $1`, [input.parentId])).rows,
    "Parent account not found.",
  );
  if (parent.account_type !== input.accountType) {
    throw new AppError(400, "VALIDATION", "A child account must use the same account type as its parent.");
  }
  if (!parent.is_header) throw new AppError(400, "VALIDATION", "The parent account must be a header.");
  const lines = await db.query("SELECT 1 FROM journal_lines WHERE account_id = $1 LIMIT 1", [input.parentId]);
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
    const next = await db.query<{ parent_id: string | null }>("SELECT parent_id FROM accounts WHERE id = $1", [cursor]);
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

function accountColumns() {
  return `a.id, a.code, a.name, a.account_type, a.account_subtype, a.parent_id, parent.code AS parent_code,
          a.is_header, a.is_control, a.is_active, a.is_system, a.normal_balance, a.description`;
}

function accountSelect() {
  return `SELECT ${accountColumns()} FROM accounts a LEFT JOIN accounts parent ON parent.id = a.parent_id`;
}

function accountReturning() {
  return `id, code, name, account_type, account_subtype, parent_id,
          (SELECT code FROM accounts parent WHERE parent.id = accounts.parent_id) AS parent_code,
          is_header, is_control, is_active, is_system, normal_balance, description`;
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
