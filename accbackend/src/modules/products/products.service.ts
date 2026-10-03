import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { AppError, one } from "../../shared/errors";
import { money } from "../../shared/money";
import { pageResult, type Page } from "../../shared/http/pagination";
import type { RequestMeta } from "../auth/auth.types";
import {
  countProducts,
  insertCategory,
  insertProduct,
  insertUnit,
  listCategories,
  listUnits,
  replaceProductSuppliers,
  replaceProductUnits,
  selectActiveSupplierIds,
  selectIncomeAccount,
  selectProductSuppliers,
  selectProduct,
  selectProducts,
  selectProductUnits,
  updateCategory,
  updateProduct,
} from "./products.repository";

type ProductInput = {
  sku: string;
  name: string;
  description?: string | null;
  itemType: "stock" | "non_stock" | "service";
  categoryId?: string | null;
  salesPrice: string;
  taxCodeId?: string | null;
  baseUnitId?: string | null;
  salesAccountId: string;
  returnAccountId: string;
  purchaseAccountId?: string | null;
  isActive: boolean;
  notes?: string | null;
  units: Array<{ unitId: string; factor: string; isBase: boolean }>;
};

export async function listProducts(page: Page, filters: { search?: string; active?: string }) {
  const params: unknown[] = [];
  const where = ["TRUE"];
  if (filters.search) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(sku ILIKE $${params.length} OR name ILIKE $${params.length})`);
  }
  if (filters.active) {
    params.push(filters.active === "true");
    where.push(`is_active = $${params.length}`);
  }
  const clause = where.join(" AND ");
  const total = Number(one((await countProducts({ query }, clause, params)).rows).count);
  params.push(page.pageSize, page.offset);
  const rows = await selectProducts({ query }, clause, params);
  return pageResult(rows.rows.map(mapProduct), total, page);
}

export async function getProduct(id: string) {
  return load({ query }, id);
}

export async function listProductSuppliers(productId: string) {
  await load({ query }, productId);
  return mapSupplierLinks(await selectProductSuppliers({ query }, productId));
}

export async function saveProductSuppliers(
  productId: string,
  input: { suppliers: Array<{ supplierId: string; supplierItemCode?: string | null; purchasePrice: string; leadTimeDays: number; isPreferred: boolean }> },
  meta: RequestMeta,
) {
  return withTransaction(async (client) => {
    await load(client, productId);
    if (input.suppliers.filter((link) => link.isPreferred).length > 1) {
      throw new AppError(400, "VALIDATION", "A product can have one preferred supplier.");
    }
    const ids = input.suppliers.map((link) => link.supplierId);
    if (new Set(ids).size !== ids.length) throw new AppError(400, "VALIDATION", "Each supplier can be linked once.");
    if (ids.length > 0) {
      const found = await selectActiveSupplierIds(client, ids);
      if (found.rows.length !== ids.length) throw new AppError(400, "VALIDATION", "Every supplier link must use an active supplier.");
    }
    await replaceProductSuppliers(client, productId, input.suppliers.map((link) => ({
      supplierId: link.supplierId,
      supplierItemCode: link.supplierItemCode?.trim() || null,
      purchasePrice: money(link.purchasePrice),
      leadTimeDays: link.leadTimeDays,
      isPreferred: link.isPreferred,
    })));
    const saved = mapSupplierLinks(await selectProductSuppliers(client, productId));
    await audit(client, meta, "products.suppliers", productId, "Updated supplier links for a product", null, saved);
    return saved;
  });
}

export async function createProduct(input: ProductInput, meta: RequestMeta) {
  return save(null, input, meta);
}

export async function updateProductProfile(id: string, input: ProductInput, meta: RequestMeta) {
  return save(id, input, meta);
}

export async function getCategories() {
  return (await listCategories({ query })).rows.map(mapCategory);
}

export async function createCategory(input: { code: string; name: string; isActive: boolean }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const row = one((await insertCategory(client, [input.code, input.name, input.isActive])).rows);
    const saved = { id: row.id, ...input };
    await audit(client, meta, "products.category_create", row.id, `Created category ${input.code}`, null, saved);
    return saved;
  });
}

export async function updateCategoryProfile(id: string, input: { code: string; name: string; isActive: boolean }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    await updateCategory(client, id, [input.code, input.name, input.isActive]);
    const saved = { id, ...input };
    await audit(client, meta, "products.category_update", id, `Updated category ${input.code}`, null, saved);
    return saved;
  });
}

export async function getUnits() {
  return (await listUnits({ query })).rows;
}

export async function createUnit(input: { code: string; name: string }, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const row = one((await insertUnit(client, [input.code, input.name])).rows);
    const saved = { id: row.id, ...input };
    await audit(client, meta, "products.unit_create", row.id, `Created unit ${input.code}`, null, saved);
    return saved;
  });
}

async function save(id: string | null, input: ProductInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    await assertIncome(client, input.salesAccountId, "The sales account must be an active income account.");
    await assertIncome(client, input.returnAccountId, "The return account must be an active income account.");
    if (input.purchaseAccountId) {
      await assertExpense(client, input.purchaseAccountId, "The purchase account must be an active expense account. Supplier bills do not post to an inventory asset.");
    }
    if (input.units.filter((unit) => unit.isBase).length > 1) {
      throw new AppError(400, "VALIDATION", "A product can have one base unit.");
    }
    const values = [
      input.sku, input.name, input.description ?? null, input.itemType, input.categoryId ?? null, money(input.salesPrice),
      input.taxCodeId ?? null, input.baseUnitId ?? null, input.salesAccountId, input.returnAccountId, input.purchaseAccountId ?? null, input.isActive, input.notes ?? null,
    ];
    const productId = id ?? one((await insertProduct(client, values)).rows).id;
    if (id) await updateProduct(client, id, values);
    await replaceProductUnits(client, productId, input.units.map((unit) => ({ ...unit, factor: money(unit.factor) })));
    const saved = await load(client, productId);
    await audit(client, meta, id ? "products.update" : "products.create", productId, `${id ? "Updated" : "Created"} product ${saved.sku}`, null, saved);
    return saved;
  });
}

async function assertIncome(db: Sql, id: string, message: string) {
  await assertAccountType(db, id, "income", message);
}

async function assertExpense(db: Sql, id: string, message: string) {
  await assertAccountType(db, id, "expense", message);
}

async function assertAccountType(db: Sql, id: string, type: string, message: string) {
  const account = one((await selectIncomeAccount(db, id)).rows, "Account not found.");
  if (!account.is_active || account.is_header || account.account_type !== type) throw new AppError(400, "VALIDATION", message);
}

async function load(db: Sql, id: string) {
  const row = one((await selectProduct(db, id)).rows, "Product not found.");
  const units = await selectProductUnits(db, id);
  return {
    ...mapProduct(row),
    units: units.rows.map((unit) => ({
      unitId: unit.unit_id,
      code: unit.code,
      name: unit.name,
      factor: unit.factor,
      isBase: unit.is_base,
    })),
  };
}

function mapProduct(row: {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  item_type: string;
  category_id: string | null;
  sales_price: string;
  tax_code_id: string | null;
  base_unit_id: string | null;
  sales_account_id: string;
  return_account_id: string;
  purchase_account_id: string | null;
  is_active: boolean;
  notes: string | null;
}) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    itemType: row.item_type,
    categoryId: row.category_id,
    salesPrice: row.sales_price,
    taxCodeId: row.tax_code_id,
    baseUnitId: row.base_unit_id,
    salesAccountId: row.sales_account_id,
    returnAccountId: row.return_account_id,
    purchaseAccountId: row.purchase_account_id,
    isActive: row.is_active,
    notes: row.notes,
  };
}

function mapSupplierLinks(result: Awaited<ReturnType<typeof selectProductSuppliers>>) {
  return result.rows.map((row) => ({
    supplierId: row.supplier_id,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    supplierItemCode: row.supplier_item_code,
    purchasePrice: row.purchase_price,
    leadTimeDays: row.lead_time_days,
    isPreferred: row.is_preferred,
  }));
}

function mapCategory(row: { id: string; code: string; name: string; is_active: boolean }) {
  return { id: row.id, code: row.code, name: row.name, isActive: row.is_active };
}

function audit(db: Sql, meta: RequestMeta, action: string, id: string, summary: string, before: unknown, after: unknown) {
  return writeAudit(db, {
    actorUserId: meta.actor.id, action, entityType: "product", entityId: id, summary, before, after,
    ipAddress: meta.ipAddress, requestId: meta.requestId,
  });
}
