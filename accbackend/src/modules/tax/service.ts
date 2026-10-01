import { query, withTransaction, type Sql } from "../../db/pool";
import { writeAudit } from "../../lib/audit";
import { addDays, assertIsoDate, todayInTimeZone } from "../../lib/dates";
import { AppError, one } from "../../lib/errors";
import { decimal } from "../../lib/money";
import type { RequestMeta } from "../auth/types";

const RATE = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

export async function listTaxCodes() {
  const rows = await query(
    `SELECT id, code, name, rate_percent::text AS rate_percent, sales_account_id, purchase_account_id,
            effective_from, effective_to, is_active
       FROM tax_codes ORDER BY code, effective_from`,
  );
  return rows.rows.map(mapTax);
}

export async function createTaxCode(
  input: {
    code: string;
    name: string;
    ratePercent: string;
    salesAccountId?: string | null;
    purchaseAccountId?: string | null;
    effectiveFrom: string;
  },
  meta: RequestMeta,
) {
  assertIsoDate(input.effectiveFrom);
  assertRate(input.ratePercent);
  return withTransaction(async (client) => {
    await assertAccounts(client, [input.salesAccountId, input.purchaseAccountId]);
    const overlap = await client.query(
      `SELECT 1 FROM tax_codes
        WHERE lower(code) = lower($1)
          AND daterange(effective_from, COALESCE(effective_to, DATE '9999-12-31'), '[]')
              && daterange($2::date, DATE '9999-12-31', '[]')`,
      [input.code.trim(), input.effectiveFrom],
    );
    if ((overlap.rowCount ?? 0) > 0) {
      throw new AppError(409, "OVERLAP", "That tax code already has a version covering this date. Retire it first.");
    }
    const row = one(
      (
        await client.query(
          `INSERT INTO tax_codes (code, name, rate_percent, sales_account_id, purchase_account_id, effective_from)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, code, name, rate_percent::text AS rate_percent, sales_account_id, purchase_account_id,
                     effective_from, effective_to, is_active`,
          [
            input.code.trim(),
            input.name.trim(),
            input.ratePercent,
            input.salesAccountId ?? null,
            input.purchaseAccountId ?? null,
            input.effectiveFrom,
          ],
        )
      ).rows,
    );
    const tax = mapTax(row);
    await writeAudit(client, event(meta, "tax_codes.create", tax.id, "Created tax code", null, tax));
    return tax;
  });
}

export async function retireTaxCode(id: string, effectiveTo: string, meta: RequestMeta) {
  assertIsoDate(effectiveTo);
  return withTransaction(async (client) => {
    const before = mapTax(
      one(
        (
          await client.query(
            `SELECT id, code, name, rate_percent::text AS rate_percent, sales_account_id, purchase_account_id,
                    effective_from, effective_to, is_active
               FROM tax_codes WHERE id = $1 FOR UPDATE`,
            [id],
          )
        ).rows,
        "Tax code not found.",
      ),
    );
    if (!before.isActive) throw new AppError(409, "RETIRED", "This tax code version is already retired.");
    if (effectiveTo < before.effectiveFrom) {
      throw new AppError(400, "VALIDATION", "The retire date cannot be before the effective date.");
    }
    const row = one(
      (
        await client.query(
          `UPDATE tax_codes SET is_active = false, effective_to = $2 WHERE id = $1
           RETURNING id, code, name, rate_percent::text AS rate_percent, sales_account_id, purchase_account_id,
                     effective_from, effective_to, is_active`,
          [id, effectiveTo],
        )
      ).rows,
    );
    const after = mapTax(row);
    await writeAudit(client, event(meta, "tax_codes.retire", id, "Retired tax code", before, after));
    return after;
  });
}

export async function getAccountingProfile() {
  const rows = await query(
    `SELECT id, country_code, name, compliance_status, notes, effective_from, effective_to, is_active
       FROM accounting_profiles ORDER BY effective_from DESC, created_at DESC`,
  );
  const history = rows.rows.map(mapProfile);
  const today = await companyToday();
  const current = history.find((row) => row.isActive && row.effectiveFrom <= today && (!row.effectiveTo || row.effectiveTo >= today)) ?? null;
  return { current, history, complianceNote: "Country tax and statutory rules stay unverified until a reviewer marks them reviewed for a named country." };
}

export async function updateAccountingProfile(
  input: { countryCode: string; name: string; complianceStatus: "unverified" | "reviewed"; notes?: string | null },
  meta: RequestMeta,
) {
  return withTransaction(async (client) => {
    const today = await companyToday(client);
    const currentRow = (
      await client.query(
        `SELECT id, country_code, name, compliance_status, notes, effective_from, effective_to, is_active
           FROM accounting_profiles
          WHERE is_active AND effective_from <= $1::date AND (effective_to IS NULL OR effective_to >= $1::date)
          ORDER BY effective_from DESC
          LIMIT 1
          FOR UPDATE`,
        [today],
      )
    ).rows[0];
    if (!currentRow) throw new AppError(409, "PROFILE_MISSING", "Run the database seed before editing the accounting profile.");
    const before = mapProfile(currentRow);
    const materialChange = before.countryCode !== input.countryCode.toUpperCase() || before.complianceStatus !== input.complianceStatus;
    let after;
    if (!materialChange || before.effectiveFrom === today) {
      const row = one(
        (
          await client.query(
            `UPDATE accounting_profiles
                SET country_code = $2, name = $3, compliance_status = $4, notes = $5
              WHERE id = $1
              RETURNING id, country_code, name, compliance_status, notes, effective_from, effective_to, is_active`,
            [before.id, input.countryCode.toUpperCase(), input.name.trim(), input.complianceStatus, blank(input.notes)],
          )
        ).rows,
      );
      after = mapProfile(row);
    } else {
      await client.query(
        `UPDATE accounting_profiles SET is_active = false, effective_to = $2 WHERE id = $1`,
        [before.id, addDays(today, -1)],
      );
      const row = one(
        (
          await client.query(
            `INSERT INTO accounting_profiles (country_code, name, compliance_status, notes, effective_from)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING id, country_code, name, compliance_status, notes, effective_from, effective_to, is_active`,
            [input.countryCode.toUpperCase(), input.name.trim(), input.complianceStatus, blank(input.notes), today],
          )
        ).rows,
      );
      after = mapProfile(row);
    }
    await writeAudit(client, event(meta, "accounting_profile.update", after.id, "Updated accounting profile", before, after));
    return after;
  });
}

async function companyToday(db: Sql = { query }) {
  const company = one((await db.query<{ timezone: string }>("SELECT timezone FROM company WHERE id = 1")).rows);
  return todayInTimeZone(company.timezone);
}

async function assertAccounts(db: Sql, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  const found = await db.query("SELECT id FROM accounts WHERE id = ANY($1::uuid[])", [unique]);
  if (found.rows.length !== unique.length) throw new AppError(400, "VALIDATION", "A tax account does not exist.");
}

function assertRate(value: string) {
  if (!RATE.test(value)) throw new AppError(400, "VALIDATION", "Tax rate must be a percentage from 0 to 100.");
  const rate = decimal(value);
  if (rate.lt(0) || rate.gt(100)) throw new AppError(400, "VALIDATION", "Tax rate must be a percentage from 0 to 100.");
}

function mapTax(row: {
  id: string;
  code: string;
  name: string;
  rate_percent: string;
  sales_account_id: string | null;
  purchase_account_id: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    ratePercent: row.rate_percent,
    salesAccountId: row.sales_account_id,
    purchaseAccountId: row.purchase_account_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    isActive: row.is_active,
  };
}

function mapProfile(row: {
  id: string;
  country_code: string;
  name: string;
  compliance_status: string;
  notes: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}) {
  return {
    id: row.id,
    countryCode: row.country_code,
    name: row.name,
    complianceStatus: row.compliance_status,
    notes: row.notes,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    isActive: row.is_active,
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
    entityType: action.startsWith("tax") ? "tax_code" : "accounting_profile",
    entityId: id,
    summary,
    before,
    after,
    ipAddress: meta.ipAddress,
    requestId: meta.requestId,
  };
}
