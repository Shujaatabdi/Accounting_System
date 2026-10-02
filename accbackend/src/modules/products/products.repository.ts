import type { Sql } from "../../db/pool";

const fields = `id, sku, name, description, item_type, category_id, sales_price::text, tax_code_id,
  base_unit_id, sales_account_id, return_account_id, is_active, notes`;

export async function countProducts(db: Sql, clause: string, params: unknown[]) {
  return db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM products WHERE ${clause}`, params);
}

export async function selectProducts(db: Sql, clause: string, params: unknown[]) {
  return db.query(
    `SELECT ${fields} FROM products WHERE ${clause} ORDER BY sku LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function selectProduct(db: Sql, id: string) {
  return db.query(`SELECT ${fields} FROM products WHERE id = $1`, [id]);
}

export async function insertProduct(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>(
    `INSERT INTO products (
       sku, name, description, item_type, category_id, sales_price, tax_code_id,
       base_unit_id, sales_account_id, return_account_id, is_active, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    values,
  );
}

export async function updateProduct(db: Sql, id: string, values: unknown[]) {
  await db.query(
    `UPDATE products SET sku=$1, name=$2, description=$3, item_type=$4, category_id=$5, sales_price=$6,
       tax_code_id=$7, base_unit_id=$8, sales_account_id=$9, return_account_id=$10, is_active=$11, notes=$12, updated_at=now()
     WHERE id = $13`,
    [...values, id],
  );
}

export async function selectProductUnits(db: Sql, productId: string) {
  return db.query(
    `SELECT pu.unit_id, u.code, u.name, pu.factor::text, pu.is_base
       FROM product_units pu JOIN units u ON u.id = pu.unit_id
      WHERE pu.product_id = $1 ORDER BY pu.is_base DESC, u.code`,
    [productId],
  );
}

export async function replaceProductUnits(db: Sql, productId: string, units: Array<{ unitId: string; factor: string; isBase: boolean }>) {
  await db.query("DELETE FROM product_units WHERE product_id = $1", [productId]);
  for (const unit of units) {
    await db.query(
      "INSERT INTO product_units (product_id, unit_id, factor, is_base) VALUES ($1,$2,$3,$4)",
      [productId, unit.unitId, unit.factor, unit.isBase],
    );
  }
}

export async function listCategories(db: Sql) {
  return db.query("SELECT id, code, name, is_active FROM product_categories ORDER BY code");
}

export async function insertCategory(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>(
    "INSERT INTO product_categories (code, name, is_active) VALUES ($1,$2,$3) RETURNING id",
    values,
  );
}

export async function updateCategory(db: Sql, id: string, values: unknown[]) {
  await db.query("UPDATE product_categories SET code=$1, name=$2, is_active=$3, updated_at=now() WHERE id=$4", [...values, id]);
}

export async function listUnits(db: Sql) {
  return db.query("SELECT id, code, name FROM units ORDER BY code");
}

export async function insertUnit(db: Sql, values: unknown[]) {
  return db.query<{ id: string }>("INSERT INTO units (code, name) VALUES ($1,$2) RETURNING id", values);
}

export async function selectIncomeAccount(db: Sql, id: string) {
  return db.query<{ id: string; is_active: boolean; is_header: boolean; account_type: string }>(
    "SELECT id, is_active, is_header, account_type FROM accounts WHERE id = $1",
    [id],
  );
}
