import type { Sql } from "../../db/pool";
import type { CustomerInput } from "./customers.types";

export type CustomerRow = {
  id: string;
  code: string;
  legal_name: string;
  display_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  tax_identifier: string | null;
  payment_terms_days: number;
  credit_limit: string | null;
  is_active: boolean;
  notes: string | null;
};

const fields = `id, code, legal_name, display_name, contact_name, phone, email, tax_identifier,
  payment_terms_days, credit_limit::text, is_active, notes`;

export async function countCustomers(db: Sql, clause: string, params: unknown[]) {
  return db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM customers WHERE ${clause}`, params);
}

export async function selectCustomers(db: Sql, clause: string, params: unknown[]) {
  return db.query<CustomerRow>(
    `SELECT ${fields} FROM customers WHERE ${clause}
     ORDER BY code
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function selectCustomer(db: Sql, id: string, lock = false) {
  return db.query<CustomerRow>(`SELECT ${fields} FROM customers WHERE id = $1${lock ? " FOR UPDATE" : ""}`, [id]);
}

export async function insertCustomer(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>(
    `INSERT INTO customers (
       code, legal_name, display_name, contact_name, phone, email, tax_identifier,
       payment_terms_days, credit_limit, is_active, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    values,
  );
}

export async function updateCustomer(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE customers SET
       code=$1, legal_name=$2, display_name=$3, contact_name=$4, phone=$5, email=$6,
       tax_identifier=$7, payment_terms_days=$8, credit_limit=$9, is_active=$10, notes=$11, updated_at=now()
     WHERE id = $12`,
    [...values, id],
  );
}

export async function selectAddresses(db: Sql, customerId: string) {
  return db.query(
    `SELECT id, address_type, line1, line2, city, region, postal_code, country_code, is_primary
       FROM customer_addresses WHERE customer_id = $1 ORDER BY is_primary DESC, line1`,
    [customerId],
  );
}

export async function selectContacts(db: Sql, customerId: string) {
  return db.query(
    `SELECT id, name, role_title, phone, email, is_primary
       FROM customer_contacts WHERE customer_id = $1 ORDER BY is_primary DESC, name`,
    [customerId],
  );
}

export async function replaceAddresses(db: Sql, customerId: string, addresses: CustomerInput["addresses"]) {
  await db.query("DELETE FROM customer_addresses WHERE customer_id = $1", [customerId]);
  for (const address of addresses) {
    await db.query(
      `INSERT INTO customer_addresses (customer_id, address_type, line1, line2, city, region, postal_code, country_code, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [customerId, address.addressType, address.line1, address.line2 ?? null, address.city ?? null, address.region ?? null, address.postalCode ?? null, address.countryCode.toUpperCase(), address.isPrimary],
    );
  }
}

export async function replaceContacts(db: Sql, customerId: string, contacts: CustomerInput["contacts"]) {
  await db.query("DELETE FROM customer_contacts WHERE customer_id = $1", [customerId]);
  for (const contact of contacts) {
    await db.query(
      `INSERT INTO customer_contacts (customer_id, name, role_title, phone, email, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [customerId, contact.name, contact.roleTitle ?? null, contact.phone ?? null, empty(contact.email), contact.isPrimary],
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
    ar_control_account_id: string | null;
  }>(
    `SELECT jl.id, jl.account_id, jl.debit::text, jl.credit::text, je.source_type, je.status,
            je.reversed_by_entry_id, s.ar_control_account_id
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       JOIN sales_settings s ON s.id = 1
      WHERE jl.id = $1
      FOR UPDATE OF jl`,
    [journalLineId],
  );
}

export async function selectActiveCustomerIds(db: Sql, ids: string[]) {
  return db.query<{ id: string }>("SELECT id FROM customers WHERE id = ANY($1::uuid[]) AND is_active", [ids]);
}

export async function replaceOpeningDetails(db: Sql, journalLineId: string, lines: Array<{ customerId: string; amount: string }>) {
  await db.query("DELETE FROM customer_opening_details WHERE journal_line_id = $1", [journalLineId]);
  for (const line of lines) {
    await db.query(
      `INSERT INTO customer_opening_details (journal_line_id, customer_id, amount) VALUES ($1, $2, $3)`,
      [journalLineId, line.customerId, line.amount],
    );
  }
}

export async function selectExposure(db: Sql, customerId: string) {
  return db.query<{ receivables: string; advances: string }>(
    `SELECT
       (
         COALESCE((
           SELECT SUM(d.amount) FROM customer_opening_details d
             JOIN journal_lines jl ON jl.id = d.journal_line_id
             JOIN journal_entries je ON je.id = jl.journal_entry_id
            WHERE d.customer_id = $1 AND je.status = 'posted' AND je.reversed_by_entry_id IS NULL
              AND je.source_type = 'opening_balance'
         ), 0)
         + COALESCE((SELECT SUM(total) FROM invoices WHERE customer_id = $1 AND status = 'posted'), 0)
         - COALESCE((SELECT SUM(total) FROM customer_returns WHERE customer_id = $1 AND status = 'posted'), 0)
         - COALESCE((SELECT SUM(amount) FROM receipts WHERE customer_id = $1 AND status = 'posted' AND unapplied_treatment = 'credit_ar'), 0)
         - COALESCE((
             SELECT SUM(a.amount) FROM receipt_allocations a
               JOIN receipts r ON r.id = a.receipt_id
              WHERE r.customer_id = $1 AND r.status = 'posted' AND r.unapplied_treatment = 'customer_advance' AND a.status = 'posted'
           ), 0)
       )::text AS receivables,
       COALESCE((
         SELECT SUM(unallocated_amount) FROM receipts
          WHERE customer_id = $1 AND status = 'posted' AND unapplied_treatment = 'customer_advance'
       ), 0)::text AS advances`,
    [customerId],
  );
}

export async function selectHistory(db: Sql, customerId: string, params: unknown[]) {
  return db.query(
    `SELECT kind, id, number, doc_date::text, status, total::text FROM (
       SELECT 'invoice' AS kind, id, invoice_number AS number, invoice_date AS doc_date, status, total
         FROM invoices WHERE customer_id = $1
       UNION ALL
       SELECT 'receipt', id, receipt_number, receipt_date, status, amount FROM receipts WHERE customer_id = $1
       UNION ALL
       SELECT 'customer_return', id, return_number, return_date, status, total FROM customer_returns WHERE customer_id = $1
     ) docs
     WHERE ($2::date IS NULL OR doc_date >= $2::date)
       AND ($3::date IS NULL OR doc_date <= $3::date)
     ORDER BY doc_date DESC, number DESC
     LIMIT $4 OFFSET $5`,
    [customerId, ...params],
  );
}

export async function countHistory(db: Sql, customerId: string, from: string | null, to: string | null) {
  return db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM (
       SELECT invoice_date AS doc_date FROM invoices WHERE customer_id = $1
       UNION ALL SELECT receipt_date FROM receipts WHERE customer_id = $1
       UNION ALL SELECT return_date FROM customer_returns WHERE customer_id = $1
     ) docs
     WHERE ($2::date IS NULL OR doc_date >= $2::date) AND ($3::date IS NULL OR doc_date <= $3::date)`,
    [customerId, from, to],
  );
}

function empty(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
