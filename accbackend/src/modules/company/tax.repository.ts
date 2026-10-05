import type { Sql } from "../../db/pool";

const TAX_RETURNING = `id, code, name, rate_percent::text AS rate_percent, sales_account_id, purchase_account_id,
            effective_from, effective_to, is_active`;

export async function listTaxRows(db: Sql) {
  return db.query(
    `SELECT ${TAX_RETURNING}
       FROM tax_codes ORDER BY code, effective_from`,
  );
}

export async function findTaxOverlap(db: Sql, code: string, effectiveFrom: string) {
  return db.query(
    `SELECT 1 FROM tax_codes
      WHERE lower(code) = lower($1)
        AND daterange(effective_from, COALESCE(effective_to, DATE '9999-12-31'), '[]')
            && daterange($2::date, DATE '9999-12-31', '[]')`,
    [code, effectiveFrom],
  );
}

export async function insertTax(db: Sql, values: unknown[]) {
  return db.query(
    `INSERT INTO tax_codes (code, name, rate_percent, sales_account_id, purchase_account_id, effective_from)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING ${TAX_RETURNING}`,
    values,
  );
}

export async function lockTax(db: Sql, id: string) {
  return db.query(
    `SELECT ${TAX_RETURNING} FROM tax_codes WHERE id = $1 FOR UPDATE`,
    [id],
  );
}

export async function retireTax(db: Sql, id: string, effectiveTo: string) {
  return db.query(
    `UPDATE tax_codes SET is_active = false, effective_to = $2 WHERE id = $1
     RETURNING ${TAX_RETURNING}`,
    [id, effectiveTo],
  );
}

export async function updateTaxAccounts(db: Sql, id: string, salesAccountId: string | null, purchaseAccountId: string | null) {
  return db.query(
    `UPDATE tax_codes SET sales_account_id = $2, purchase_account_id = $3 WHERE id = $1
     RETURNING ${TAX_RETURNING}`,
    [id, salesAccountId, purchaseAccountId],
  );
}

export async function findAccounts(db: Sql, ids: string[]) {
  return db.query("SELECT id FROM accounts WHERE id = ANY($1::uuid[])", [ids]);
}

export async function listProfiles(db: Sql) {
  return db.query(
    `SELECT id, country_code, name, compliance_status, notes, effective_from, effective_to, is_active
       FROM accounting_profiles ORDER BY effective_from DESC, created_at DESC`,
  );
}

export async function lockCurrentProfile(db: Sql, today: string) {
  return db.query(
    `SELECT id, country_code, name, compliance_status, notes, effective_from, effective_to, is_active
       FROM accounting_profiles
      WHERE is_active AND effective_from <= $1::date AND (effective_to IS NULL OR effective_to >= $1::date)
      ORDER BY effective_from DESC
      LIMIT 1
      FOR UPDATE`,
    [today],
  );
}

export async function lockUpcomingProfile(db: Sql, today: string) {
  return db.query(
    `SELECT id, country_code, name, compliance_status, notes, effective_from, effective_to, is_active
       FROM accounting_profiles
      WHERE is_active AND effective_from > $1::date AND (effective_to IS NULL OR effective_to >= effective_from)
      ORDER BY effective_from ASC
      LIMIT 1
      FOR UPDATE`,
    [today],
  );
}

export async function updateProfile(db: Sql, id: string, values: unknown[]) {
  return db.query(
    `UPDATE accounting_profiles
        SET country_code = $2, name = $3, compliance_status = $4, notes = $5
      WHERE id = $1
      RETURNING id, country_code, name, compliance_status, notes, effective_from, effective_to, is_active`,
    [id, ...values],
  );
}

export async function closeProfile(db: Sql, id: string, effectiveTo: string) {
  await db.query(
    `UPDATE accounting_profiles SET is_active = false, effective_to = $2 WHERE id = $1`,
    [id, effectiveTo],
  );
}

export async function insertProfile(db: Sql, values: unknown[]) {
  return db.query(
    `INSERT INTO accounting_profiles (country_code, name, compliance_status, notes, effective_from)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, country_code, name, compliance_status, notes, effective_from, effective_to, is_active`,
    values,
  );
}
