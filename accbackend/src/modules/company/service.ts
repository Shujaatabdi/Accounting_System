import { query, withTransaction, type Sql } from "../../db/pool";
import { writeAudit } from "../../lib/audit";
import { assertTimeZone } from "../../lib/dates";
import { AppError, one } from "../../lib/errors";
import type { RequestMeta } from "../auth/types";

export type AddressInput = {
  id?: string;
  addressType: "registered" | "billing" | "other";
  line1: string;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode: string;
  isPrimary: boolean;
};

export type ContactInput = {
  id?: string;
  name: string;
  roleTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary: boolean;
};

export type CompanyInput = {
  legalName: string;
  displayName: string;
  countryCode: string;
  taxIdentifier?: string | null;
  timezone: string;
  currencyName: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  fiscalYearStartMonth: number;
  requireDistinctApprover: boolean;
  logoUrl?: string | null;
  notes?: string | null;
  addresses: AddressInput[];
  contacts: ContactInput[];
};

type CompanyRow = {
  legal_name: string;
  display_name: string;
  country_code: string;
  tax_identifier: string | null;
  timezone: string;
  currency_name: string;
  currency_symbol: string;
  currency_decimal_places: number;
  fiscal_year_start_month: number;
  require_distinct_approver: boolean;
  logo_url: string | null;
  notes: string | null;
};

export async function getCompany() {
  const company = one(
    (await query<CompanyRow>("SELECT * FROM company WHERE id = 1")).rows,
    "Company profile has not been seeded.",
  );
  const addresses = await query(
    `SELECT id, address_type, line1, line2, city, region, postal_code, country_code, is_primary
       FROM company_addresses ORDER BY is_primary DESC, line1`,
  );
  const contacts = await query(
    `SELECT id, name, role_title, phone, email, is_primary FROM company_contacts ORDER BY is_primary DESC, name`,
  );
  return {
    ...mapCompany(company),
    addresses: addresses.rows.map(mapAddress),
    contacts: contacts.rows.map(mapContact),
    profilePlaceholder: company.country_code === "ZZ" || company.legal_name === "Company name not set",
  };
}

export async function updateCompany(input: CompanyInput, meta: RequestMeta) {
  assertTimeZone(input.timezone);
  assertSinglePrimary(input.addresses, "address");
  assertSinglePrimary(input.contacts, "contact");
  return withTransaction(async (client) => {
    const before = await getCompanyIn(client);
    const posted = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM journal_entries WHERE status = 'posted') AS exists",
    );
    const currencyChanged =
      before.currencyName !== input.currencyName ||
      before.currencySymbol !== input.currencySymbol ||
      before.currencyDecimalPlaces !== input.currencyDecimalPlaces;
    if (posted.rows[0]?.exists && currencyChanged) {
      throw new AppError(
        409,
        "CURRENCY_LOCKED",
        "Currency name, symbol, and decimal places cannot change after a journal has been posted.",
      );
    }
    await client.query(
      `UPDATE company SET
         legal_name = $1, display_name = $2, country_code = $3, tax_identifier = $4, timezone = $5,
         currency_name = $6, currency_symbol = $7, currency_decimal_places = $8, fiscal_year_start_month = $9,
         require_distinct_approver = $10, logo_url = $11, notes = $12
       WHERE id = 1`,
      [
        input.legalName,
        input.displayName,
        input.countryCode.toUpperCase(),
        empty(input.taxIdentifier),
        input.timezone,
        input.currencyName,
        input.currencySymbol,
        input.currencyDecimalPlaces,
        input.fiscalYearStartMonth,
        input.requireDistinctApprover,
        empty(input.logoUrl),
        empty(input.notes),
      ],
    );
    await replaceAddresses(client, input.addresses);
    await replaceContacts(client, input.contacts);
    const after = await getCompanyIn(client);
    await writeAudit(client, {
      actorUserId: meta.actor.id,
      action: "company.update",
      entityType: "company",
      entityId: "1",
      summary: "Updated company profile",
      before,
      after,
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
    });
    return after;
  });
}

async function getCompanyIn(client: Sql) {
  const company = one((await client.query<CompanyRow>("SELECT * FROM company WHERE id = 1")).rows);
  const addresses = await client.query(
    `SELECT id, address_type, line1, line2, city, region, postal_code, country_code, is_primary
       FROM company_addresses ORDER BY line1`,
  );
  const contacts = await client.query(
    `SELECT id, name, role_title, phone, email, is_primary FROM company_contacts ORDER BY name`,
  );
  return {
    ...mapCompany(company),
    addresses: addresses.rows.map(mapAddress),
    contacts: contacts.rows.map(mapContact),
    profilePlaceholder: company.country_code === "ZZ" || company.legal_name === "Company name not set",
  };
}

async function replaceAddresses(client: Sql, addresses: AddressInput[]) {
  const kept = addresses.flatMap((address) => (address.id ? [address.id] : []));
  await client.query("DELETE FROM company_addresses WHERE NOT (id = ANY($1::uuid[]))", [kept]);
  for (const address of addresses) {
    const values = [
      address.addressType,
      address.line1,
      empty(address.line2),
      empty(address.city),
      empty(address.region),
      empty(address.postalCode),
      address.countryCode.toUpperCase(),
      address.isPrimary,
    ];
    if (address.id) {
      const updated = await client.query("UPDATE company_addresses SET address_type=$2, line1=$3, line2=$4, city=$5, region=$6, postal_code=$7, country_code=$8, is_primary=$9 WHERE id=$1", [
        address.id,
        ...values,
      ]);
      if (updated.rowCount !== 1) throw new AppError(400, "VALIDATION", "An address id does not belong to this company.");
    } else {
      await client.query(
        `INSERT INTO company_addresses (address_type, line1, line2, city, region, postal_code, country_code, is_primary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        values,
      );
    }
  }
}

async function replaceContacts(client: Sql, contacts: ContactInput[]) {
  const kept = contacts.flatMap((contact) => (contact.id ? [contact.id] : []));
  await client.query("DELETE FROM company_contacts WHERE NOT (id = ANY($1::uuid[]))", [kept]);
  for (const contact of contacts) {
    const values = [contact.name, empty(contact.roleTitle), empty(contact.phone), empty(contact.email), contact.isPrimary];
    if (contact.id) {
      const updated = await client.query(
        "UPDATE company_contacts SET name=$2, role_title=$3, phone=$4, email=$5, is_primary=$6 WHERE id=$1",
        [contact.id, ...values],
      );
      if (updated.rowCount !== 1) throw new AppError(400, "VALIDATION", "A contact id does not belong to this company.");
    } else {
      await client.query(
        `INSERT INTO company_contacts (name, role_title, phone, email, is_primary) VALUES ($1,$2,$3,$4,$5)`,
        values,
      );
    }
  }
}

function assertSinglePrimary(rows: Array<{ isPrimary: boolean }>, label: string) {
  if (rows.filter((row) => row.isPrimary).length > 1) {
    throw new AppError(400, "VALIDATION", `Only one ${label} can be primary.`);
  }
}

function empty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapCompany(row: CompanyRow) {
  return {
    legalName: row.legal_name,
    displayName: row.display_name,
    countryCode: row.country_code,
    taxIdentifier: row.tax_identifier,
    timezone: row.timezone,
    currencyName: row.currency_name,
    currencySymbol: row.currency_symbol,
    currencyDecimalPlaces: row.currency_decimal_places,
    fiscalYearStartMonth: row.fiscal_year_start_month,
    requireDistinctApprover: row.require_distinct_approver,
    logoUrl: row.logo_url,
    notes: row.notes,
  };
}

function mapAddress(row: {
  id: string;
  address_type: string;
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string;
  is_primary: boolean;
}) {
  return {
    id: row.id,
    addressType: row.address_type,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    isPrimary: row.is_primary,
  };
}

function mapContact(row: {
  id: string;
  name: string;
  role_title: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}) {
  return {
    id: row.id,
    name: row.name,
    roleTitle: row.role_title,
    phone: row.phone,
    email: row.email,
    isPrimary: row.is_primary,
  };
}
