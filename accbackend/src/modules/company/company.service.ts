import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { assertTimeZone } from "../../shared/dates";
import { AppError, one } from "../../shared/errors";
import type { RequestMeta } from "../auth/auth.types";
import {
  deleteAddressesExcept,
  deleteContactsExcept,
  insertAddress,
  insertContact,
  postedJournalExists,
  selectAddresses,
  selectCompany,
  selectContacts,
  updateAddress,
  updateCompany,
  updateContact,
  type CompanyRow,
} from "./company.repository";
import type { AddressInput, CompanyInput, ContactInput } from "./company.types";

export async function getCompany() {
  return loadCompany({ query }, "is_primary DESC, line1", "is_primary DESC, name");
}

export async function updateCompanyProfile(input: CompanyInput, meta: RequestMeta) {
  assertTimeZone(input.timezone);
  assertSinglePrimary(input.addresses, "address");
  assertSinglePrimary(input.contacts, "contact");
  return withTransaction(async (client) => {
    const before = await loadCompany(client, "line1", "name");
    const posted = await postedJournalExists(client);
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
    await updateCompany(client, [
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
    ]);
    await replaceAddresses(client, input.addresses);
    await replaceContacts(client, input.contacts);
    const after = await loadCompany(client, "line1", "name");
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

async function loadCompany(db: Sql, addressOrder: string, contactOrder: string) {
  const company = one((await selectCompany(db)).rows, "Company profile has not been seeded.");
  const addresses = await selectAddresses(db, addressOrder);
  const contacts = await selectContacts(db, contactOrder);
  return {
    ...mapCompany(company),
    addresses: addresses.rows.map(mapAddress),
    contacts: contacts.rows.map(mapContact),
    profilePlaceholder: company.country_code === "ZZ" || company.legal_name === "Company name not set",
  };
}

async function replaceAddresses(client: Sql, addresses: AddressInput[]) {
  const kept = addresses.flatMap((address) => (address.id ? [address.id] : []));
  await deleteAddressesExcept(client, kept);
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
      const updated = await updateAddress(client, address.id, values);
      if (updated.rowCount !== 1) throw new AppError(400, "VALIDATION", "An address id does not belong to this company.");
    } else {
      await insertAddress(client, values);
    }
  }
}

async function replaceContacts(client: Sql, contacts: ContactInput[]) {
  const kept = contacts.flatMap((contact) => (contact.id ? [contact.id] : []));
  await deleteContactsExcept(client, kept);
  for (const contact of contacts) {
    const values = [contact.name, empty(contact.roleTitle), empty(contact.phone), empty(contact.email), contact.isPrimary];
    if (contact.id) {
      const updated = await updateContact(client, contact.id, values);
      if (updated.rowCount !== 1) throw new AppError(400, "VALIDATION", "A contact id does not belong to this company.");
    } else {
      await insertContact(client, values);
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
