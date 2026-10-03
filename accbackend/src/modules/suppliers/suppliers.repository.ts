import type { Sql } from "../../db/pool";
import type { SupplierInput } from "./suppliers.types";

export type SupplierRow = {
  id: string;
  code: string;
  legal_name: string;
  display_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  tax_identifier: string | null;
  tax_country_code: string | null;
  party_type: string | null;
  cnic_ntn: string | null;
  ntn_check_digit: string | null;
  strn: string | null;
  payment_terms_days: number;
  is_active: boolean;
  notes: string | null;
};

const fields = `id, code, legal_name, display_name, contact_name, phone, email, tax_identifier,
  tax_country_code, party_type, cnic_ntn, ntn_check_digit, strn,
  payment_terms_days, is_active, notes`;

export async function countSuppliers(db: Sql, clause: string, params: unknown[]) {
  return db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM suppliers WHERE ${clause}`, params);
}

export async function selectSuppliers(db: Sql, clause: string, params: unknown[]) {
  return db.query<SupplierRow>(
    `SELECT ${fields} FROM suppliers WHERE ${clause}
     ORDER BY code
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function selectSupplier(db: Sql, id: string, lock = false) {
  return db.query<SupplierRow>(`SELECT ${fields} FROM suppliers WHERE id = $1${lock ? " FOR UPDATE" : ""}`, [id]);
}

export async function insertSupplier(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>(
    `INSERT INTO suppliers (
       code, legal_name, display_name, contact_name, phone, email, tax_identifier, tax_country_code,
       party_type, cnic_ntn, ntn_check_digit, strn, payment_terms_days, is_active, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    values,
  );
}

export async function updateSupplier(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE suppliers SET
       code=$1, legal_name=$2, display_name=$3, contact_name=$4, phone=$5, email=$6,
       tax_identifier=$7, tax_country_code=$8, party_type=$9, cnic_ntn=$10, ntn_check_digit=$11, strn=$12,
       payment_terms_days=$13, is_active=$14, notes=$15, updated_at=now()
     WHERE id = $16`,
    [...values, id],
  );
}

export async function selectAddresses(db: Sql, supplierId: string) {
  return db.query(
    `SELECT id, address_type, line1, line2, city, region, postal_code, country_code, is_primary
       FROM supplier_addresses WHERE supplier_id = $1 ORDER BY is_primary DESC, line1`,
    [supplierId],
  );
}

export async function selectContacts(db: Sql, supplierId: string) {
  return db.query(
    `SELECT id, name, role_title, phone, email, is_primary
       FROM supplier_contacts WHERE supplier_id = $1 ORDER BY is_primary DESC, name`,
    [supplierId],
  );
}

export async function replaceAddresses(db: Sql, supplierId: string, addresses: SupplierInput["addresses"]) {
  await db.query("DELETE FROM supplier_addresses WHERE supplier_id = $1", [supplierId]);
  for (const address of addresses) {
    await db.query(
      `INSERT INTO supplier_addresses (supplier_id, address_type, line1, line2, city, region, postal_code, country_code, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [supplierId, address.addressType, address.line1, address.line2 ?? null, address.city ?? null, address.region ?? null, address.postalCode ?? null, address.countryCode.toUpperCase(), address.isPrimary],
    );
  }
}

export async function replaceContacts(db: Sql, supplierId: string, contacts: SupplierInput["contacts"]) {
  await db.query("DELETE FROM supplier_contacts WHERE supplier_id = $1", [supplierId]);
  for (const contact of contacts) {
    await db.query(
      `INSERT INTO supplier_contacts (supplier_id, name, role_title, phone, email, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [supplierId, contact.name, contact.roleTitle ?? null, contact.phone ?? null, empty(contact.email), contact.isPrimary],
    );
  }
}

export async function lockOpeningLine(db: Sql, journalLineId: string) {
  return db.query<{
    id: string;
    account_id: string;
    debit: string;
    credit: string;
    source_type: string;
    status: string;
    reversed_by_entry_id: string | null;
    ap_control_account_id: string | null;
  }>(
    `SELECT jl.id, jl.account_id, jl.debit::text, jl.credit::text, je.source_type, je.status,
            je.reversed_by_entry_id, s.ap_control_account_id
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       JOIN purchasing_settings s ON s.id = 1
      WHERE jl.id = $1
      FOR UPDATE OF jl`,
    [journalLineId],
  );
}

export async function selectActiveSupplierIds(db: Sql, ids: string[]) {
  return db.query<{ id: string }>("SELECT id FROM suppliers WHERE id = ANY($1::uuid[]) AND is_active", [ids]);
}

export async function replaceOpeningDetails(db: Sql, journalLineId: string, lines: Array<{ supplierId: string; amount: string }>) {
  await db.query("DELETE FROM supplier_opening_details WHERE journal_line_id = $1", [journalLineId]);
  for (const line of lines) {
    await db.query(
      `INSERT INTO supplier_opening_details (journal_line_id, supplier_id, amount) VALUES ($1, $2, $3)`,
      [journalLineId, line.supplierId, line.amount],
    );
  }
}

export async function selectExposure(db: Sql, supplierId: string) {
  return db.query<{ payables: string; advances: string }>(
    `SELECT
       (
         COALESCE((
           SELECT SUM(d.amount) FROM supplier_opening_details d
             JOIN journal_lines jl ON jl.id = d.journal_line_id
             JOIN journal_entries je ON je.id = jl.journal_entry_id
            WHERE d.supplier_id = $1 AND je.status = 'posted' AND je.reversed_by_entry_id IS NULL
              AND je.source_type = 'opening_balance'
         ), 0)
         + COALESCE((SELECT SUM(total) FROM supplier_bills WHERE supplier_id = $1 AND status = 'posted'), 0)
         - COALESCE((SELECT SUM(total) FROM supplier_returns WHERE supplier_id = $1 AND status = 'posted'), 0)
         - COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = $1 AND status = 'posted' AND ap_treatment = 'direct_ap'), 0)
         - COALESCE((
             SELECT SUM(a.amount) FROM supplier_payment_allocations a
               JOIN supplier_payments p ON p.id = a.supplier_payment_id
              WHERE p.supplier_id = $1 AND p.status = 'posted' AND p.ap_treatment = 'supplier_advance'
                AND a.status = 'posted' AND a.journal_entry_id IS DISTINCT FROM p.journal_entry_id
           ), 0)
       )::text AS payables,
       COALESCE((
         SELECT SUM(unallocated_amount) FROM supplier_payments
          WHERE supplier_id = $1 AND status = 'posted' AND ap_treatment = 'supplier_advance'
       ), 0)::text AS advances`,
    [supplierId],
  );
}

export async function selectHistory(db: Sql, supplierId: string, params: unknown[]) {
  return db.query(
    `SELECT kind, id, number, doc_date::text, status, total::text FROM (
       SELECT 'supplier_bill' AS kind, id, bill_number AS number, bill_date AS doc_date, status, total
         FROM supplier_bills WHERE supplier_id = $1
       UNION ALL
       SELECT 'supplier_payment', id, payment_number, payment_date, status, amount FROM supplier_payments WHERE supplier_id = $1
       UNION ALL
       SELECT 'supplier_return', id, return_number, return_date, status, total FROM supplier_returns WHERE supplier_id = $1
     ) docs
     WHERE ($2::date IS NULL OR doc_date >= $2::date)
       AND ($3::date IS NULL OR doc_date <= $3::date)
     ORDER BY doc_date DESC, number DESC
     LIMIT $4 OFFSET $5`,
    [supplierId, ...params],
  );
}

export async function countHistory(db: Sql, supplierId: string, from: string | null, to: string | null) {
  return db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM (
       SELECT bill_date AS doc_date FROM supplier_bills WHERE supplier_id = $1
       UNION ALL SELECT payment_date FROM supplier_payments WHERE supplier_id = $1
       UNION ALL SELECT return_date FROM supplier_returns WHERE supplier_id = $1
     ) docs
     WHERE ($2::date IS NULL OR doc_date >= $2::date) AND ($3::date IS NULL OR doc_date <= $3::date)`,
    [supplierId, from, to],
  );
}

function empty(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
