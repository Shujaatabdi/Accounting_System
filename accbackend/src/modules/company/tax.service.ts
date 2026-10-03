import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { addDays, assertIsoDate, todayInTimeZone } from "../../shared/dates";
import { AppError, one } from "../../shared/errors";
import { decimal } from "../../shared/money";
import type { RequestMeta } from "../auth/auth.types";
import { selectTimezone } from "./company.repository";
import { selectPostableAccount } from "./sales.repository";
import {
  closeProfile,
  findTaxOverlap,
  insertProfile,
  insertTax,
  listProfiles,
  listTaxRows,
  lockCurrentProfile,
  lockTax,
  retireTax,
  updateProfile,
  updateTaxAccounts,
} from "./tax.repository";

const RATE = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

export async function listTaxCodes() {
  const rows = await listTaxRows({ query });
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
    await assertTaxMappings(client, input.salesAccountId ?? null, input.purchaseAccountId ?? null, decimal(input.ratePercent).gt(0));
    const overlap = await findTaxOverlap(client, input.code.trim(), input.effectiveFrom);
    if ((overlap.rowCount ?? 0) > 0) {
      throw new AppError(409, "OVERLAP", "That tax code already has a version covering this date. Retire it first.");
    }
    const row = one(
      (
        await insertTax(client, [
          input.code.trim(),
          input.name.trim(),
          input.ratePercent,
          input.salesAccountId ?? null,
          input.purchaseAccountId ?? null,
          input.effectiveFrom,
        ])
      ).rows,
    );
    const tax = mapTax(row);
    await writeAudit(client, event(meta, "tax_codes.create", tax.id, "Created tax code", null, tax));
    return tax;
  });
}

export async function updateTaxCodeAccounts(
  id: string,
  input: { salesAccountId?: string | null; purchaseAccountId?: string | null },
  meta: RequestMeta,
) {
  return withTransaction(async (client) => {
    const before = mapTax(one((await lockTax(client, id)).rows, "Tax code not found."));
    const salesAccountId = input.salesAccountId === undefined ? before.salesAccountId : input.salesAccountId ?? null;
    const purchaseAccountId = input.purchaseAccountId === undefined ? before.purchaseAccountId : input.purchaseAccountId ?? null;
    await assertTaxMappings(client, salesAccountId, purchaseAccountId, decimal(before.ratePercent).gt(0) && before.isActive);
    const after = mapTax(one((await updateTaxAccounts(client, id, salesAccountId, purchaseAccountId)).rows));
    await writeAudit(client, event(meta, "tax_codes.update_accounts", id, "Updated tax code accounts", before, after));
    return after;
  });
}

export async function retireTaxCode(id: string, effectiveTo: string, meta: RequestMeta) {
  assertIsoDate(effectiveTo);
  return withTransaction(async (client) => {
    const before = mapTax(one((await lockTax(client, id)).rows, "Tax code not found."));
    if (!before.isActive) throw new AppError(409, "RETIRED", "This tax code version is already retired.");
    if (effectiveTo < before.effectiveFrom) {
      throw new AppError(400, "VALIDATION", "The retire date cannot be before the effective date.");
    }
    const after = mapTax(one((await retireTax(client, id, effectiveTo)).rows));
    await writeAudit(client, event(meta, "tax_codes.retire", id, "Retired tax code", before, after));
    return after;
  });
}

export async function getAccountingProfile() {
  const rows = await listProfiles({ query });
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
    const currentRow = (await lockCurrentProfile(client, today)).rows[0];
    if (!currentRow) throw new AppError(409, "PROFILE_MISSING", "Run the database seed before editing the accounting profile.");
    const before = mapProfile(currentRow);
    const materialChange = before.countryCode !== input.countryCode.toUpperCase() || before.complianceStatus !== input.complianceStatus;
    let after;
    if (!materialChange || before.effectiveFrom === today) {
      after = mapProfile(
        one((await updateProfile(client, before.id, [input.countryCode.toUpperCase(), input.name.trim(), input.complianceStatus, blank(input.notes)])).rows),
      );
    } else {
      await closeProfile(client, before.id, addDays(today, -1));
      after = mapProfile(
        one(
          (
            await insertProfile(client, [
              input.countryCode.toUpperCase(),
              input.name.trim(),
              input.complianceStatus,
              blank(input.notes),
              today,
            ])
          ).rows,
        ),
      );
    }
    await writeAudit(client, event(meta, "accounting_profile.update", after.id, "Updated accounting profile", before, after));
    return after;
  });
}

async function companyToday(db: Sql = { query }) {
  const company = one((await selectTimezone(db)).rows);
  return todayInTimeZone(company.timezone);
}

export async function assertMappedSalesTaxAccount(db: Sql, accountId: string | null, required: boolean) {
  if (!accountId) {
    if (required) {
      throw new AppError(400, "TAX_ACCOUNT", "A tax code with a rate above zero needs an active liability account that is not a header before it can be used.");
    }
    return;
  }
  const account = one((await selectPostableAccount(db, accountId)).rows, "Account not found.");
  if (!account.is_active || account.is_header || account.account_type !== "liability") {
    throw new AppError(400, "TAX_ACCOUNT", "The sales tax account must be an active liability account that is not a header.");
  }
}

export async function assertMappedPurchaseTaxAccount(db: Sql, accountId: string | null, required: boolean) {
  if (!accountId) {
    if (required) {
      throw new AppError(400, "TAX_ACCOUNT", "Set an active asset account that is not a header on this tax code before using it on a supplier bill.");
    }
    return;
  }
  const account = one((await selectPostableAccount(db, accountId)).rows, "Account not found.");
  if (!account.is_active || account.is_header || account.account_type !== "asset") {
    throw new AppError(400, "TAX_ACCOUNT", "The purchase tax account must be an active asset account that is not a header.");
  }
}

async function assertTaxMappings(db: Sql, salesAccountId: string | null, purchaseAccountId: string | null, ratePositive: boolean) {
  if (ratePositive && !salesAccountId && !purchaseAccountId) {
    throw new AppError(400, "TAX_ACCOUNT", "A tax code with a rate above zero needs a sales tax liability account, a purchase tax asset account, or both.");
  }
  await assertMappedSalesTaxAccount(db, salesAccountId, false);
  await assertMappedPurchaseTaxAccount(db, purchaseAccountId, false);
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
