import type { Sql } from "../../db/pool";

export type CompanyRow = {
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

const COMPANY_SQL = "SELECT * FROM company WHERE id = 1";

export async function selectCompany(db: Sql) {
  return db.query<CompanyRow>(COMPANY_SQL);
}

export async function selectAddresses(db: Sql, orderBy: string) {
  return db.query(
    `SELECT id, address_type, line1, line2, city, region, postal_code, country_code, is_primary
       FROM company_addresses ORDER BY ${orderBy}`,
  );
}

export async function selectContacts(db: Sql, orderBy: string) {
  return db.query(
    `SELECT id, name, role_title, phone, email, is_primary FROM company_contacts ORDER BY ${orderBy}`,
  );
}

export async function postedJournalExists(db: Sql) {
  return db.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM journal_entries WHERE status = 'posted') AS exists",
  );
}

export async function updateCompany(db: Sql, values: unknown[]) {
  await db.query(
    `UPDATE company SET
       legal_name = $1, display_name = $2, country_code = $3, tax_identifier = $4, timezone = $5,
       currency_name = $6, currency_symbol = $7, currency_decimal_places = $8, fiscal_year_start_month = $9,
       require_distinct_approver = $10, logo_url = $11, notes = $12
     WHERE id = 1`,
    values,
  );
}

export async function deleteAddressesExcept(db: Sql, ids: string[]) {
  await db.query("DELETE FROM company_addresses WHERE NOT (id = ANY($1::uuid[]))", [ids]);
}

export async function updateAddress(db: Sql, id: string, values: unknown[]) {
  return db.query(
    "UPDATE company_addresses SET address_type=$2, line1=$3, line2=$4, city=$5, region=$6, postal_code=$7, country_code=$8, is_primary=$9 WHERE id=$1",
    [id, ...values],
  );
}

export async function insertAddress(db: Sql, values: unknown[]) {
  await db.query(
    `INSERT INTO company_addresses (address_type, line1, line2, city, region, postal_code, country_code, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    values,
  );
}

export async function deleteContactsExcept(db: Sql, ids: string[]) {
  await db.query("DELETE FROM company_contacts WHERE NOT (id = ANY($1::uuid[]))", [ids]);
}

export async function updateContact(db: Sql, id: string, values: unknown[]) {
  return db.query(
    "UPDATE company_contacts SET name=$2, role_title=$3, phone=$4, email=$5, is_primary=$6 WHERE id=$1",
    [id, ...values],
  );
}

export async function insertContact(db: Sql, values: unknown[]) {
  await db.query(
    `INSERT INTO company_contacts (name, role_title, phone, email, is_primary) VALUES ($1,$2,$3,$4,$5)`,
    values,
  );
}

export async function selectTimezone(db: Sql) {
  return db.query<{ timezone: string }>("SELECT timezone FROM company WHERE id = 1");
}

export async function selectRequireDistinctApprover(db: Sql) {
  return db.query<{ require_distinct_approver: boolean }>("SELECT require_distinct_approver FROM company WHERE id = 1");
}

export async function selectCurrencyScale(db: Sql) {
  return db.query<{ currency_decimal_places: number }>("SELECT currency_decimal_places FROM company WHERE id = 1");
}

export async function selectFiscalStartMonth(db: Sql) {
  return db.query<{ fiscal_year_start_month: number }>("SELECT fiscal_year_start_month FROM company WHERE id = 1");
}
