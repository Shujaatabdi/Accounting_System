import { query, withTransaction } from "../../db/pool";
import { writeAudit } from "../../lib/audit";
import { one } from "../../lib/errors";
import { pageResult, toPage, type Page } from "../../lib/pagination";
import type { RequestMeta } from "../auth/types";

export type BranchInput = {
  code: string;
  name: string;
  isActive: boolean;
  line1?: string | null;
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
};

export async function listBranches(page: Page, search?: string) {
  const term = search?.replace(/[%_]/g, "").trim();
  const where = term ? "WHERE code ILIKE $1 OR name ILIKE $1" : "";
  const params = term ? [`%${term}%`] : [];
  const total = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM branches ${where}`, params);
  const rows = await query(
    `SELECT id, code, name, is_active, line1, city, region, country_code
       FROM branches ${where}
      ORDER BY code
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, page.offset],
  );
  return pageResult(rows.rows.map(mapBranch), Number(total.rows[0].count), page);
}

export async function createBranch(input: BranchInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const row = one(
      (
        await client.query(
          `INSERT INTO branches (code, name, is_active, line1, city, region, country_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, code, name, is_active, line1, city, region, country_code`,
          values(input),
        )
      ).rows,
    );
    const branch = mapBranch(row);
    await writeAudit(client, audit(meta, "branches.create", branch.id, "Created branch", null, branch));
    return branch;
  });
}

export async function updateBranch(id: string, input: BranchInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const before = mapBranch(
      one(
        (
          await client.query(
            `SELECT id, code, name, is_active, line1, city, region, country_code FROM branches WHERE id = $1 FOR UPDATE`,
            [id],
          )
        ).rows,
        "Branch not found.",
      ),
    );
    const after = mapBranch(
      one(
        (
          await client.query(
            `UPDATE branches
                SET code=$2, name=$3, is_active=$4, line1=$5, city=$6, region=$7, country_code=$8
              WHERE id=$1
              RETURNING id, code, name, is_active, line1, city, region, country_code`,
            [id, ...values(input)],
          )
        ).rows,
      ),
    );
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

export { toPage };
