import { query } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { one } from "../../shared/errors";
import { pageResult, type Page } from "../../shared/http/pagination";
import type { AuthUser, RequestMeta } from "../auth/auth.types";
import { countBranches, insertBranch, lockBranch, saveBranch, selectAccessibleBranches, selectBranches } from "./branches.repository";
import type { BranchInput } from "./branches.types";

export async function listBranches(page: Page, search?: string) {
  const term = search?.replace(/[%_]/g, "").trim();
  const where = term ? "WHERE code ILIKE $1 OR name ILIKE $1" : "";
  const params = term ? [`%${term}%`] : [];
  const total = await countBranches({ query }, where, params);
  const rows = await selectBranches({ query }, where, [...params, page.pageSize, page.offset]);
  return pageResult(rows.rows.map(mapBranch), Number(total.rows[0].count), page);
}

export async function listAccessibleBranches(actor: AuthUser) {
  const rows = await selectAccessibleBranches({ query }, actor.branchIds);
  return rows.rows.map((row) => ({ id: row.id, code: row.code, name: row.name, isActive: row.is_active }));
}

export async function createBranch(input: BranchInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const branch = mapBranch(one((await insertBranch(client, values(input))).rows));
    await writeAudit(client, audit(meta, "branches.create", branch.id, "Created branch", null, branch));
    return branch;
  });
}

export async function updateBranch(id: string, input: BranchInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const before = mapBranch(one((await lockBranch(client, id)).rows, "Branch not found."));
    const after = mapBranch(one((await saveBranch(client, id, values(input))).rows));
    await writeAudit(client, audit(meta, "branches.update", id, "Updated branch", before, after));
    return after;
  });
}

function values(input: BranchInput) {
  return [
    input.code.trim(),
    input.name.trim(),
    input.isActive,
    blank(input.line1),
    blank(input.city),
    blank(input.region),
    input.countryCode ? input.countryCode.toUpperCase() : null,
  ];
}

function mapBranch(row: {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  line1: string | null;
  city: string | null;
  region: string | null;
  country_code: string | null;
}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
    line1: row.line1,
    city: row.city,
    region: row.region,
    countryCode: row.country_code,
  };
}

function blank(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function audit(meta: RequestMeta, action: string, id: string, summary: string, before: unknown, after: unknown) {
  return {
    actorUserId: meta.actor.id,
    action,
    entityType: "branch",
    entityId: id,
    summary,
    before,
    after,
    ipAddress: meta.ipAddress,
    requestId: meta.requestId,
  };
}
