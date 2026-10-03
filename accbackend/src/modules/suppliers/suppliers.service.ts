import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { AppError, one } from "../../shared/errors";
import { decimal, money } from "../../shared/money";
import { pageResult, type Page } from "../../shared/http/pagination";
import type { RequestMeta } from "../auth/auth.types";
import { displayCnicNtn, parseCnicNtn, type PartyType } from "../customers/customer-tax";
import { selectSuppliersForProduct } from "../products/products.repository";
import {
  countHistory,
  countSuppliers,
  insertSupplier,
  lockOpeningLine,
  replaceAddresses,
  replaceContacts,
  replaceOpeningDetails,
  selectActiveSupplierIds,
  selectAddresses,
  selectContacts,
  selectExposure,
  selectHistory,
  selectSupplier,
  selectSuppliers,
  updateSupplier,
  type SupplierRow,
} from "./suppliers.repository";
import type { OpeningDetailInput, SupplierInput } from "./suppliers.types";

export async function listSuppliers(page: Page, filters: { search?: string; active?: string }) {
  const params: unknown[] = [];
  const where = ["TRUE"];
  if (filters.search) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(code ILIKE $${params.length} OR legal_name ILIKE $${params.length} OR display_name ILIKE $${params.length})`);
  }
  if (filters.active) {
    params.push(filters.active === "true");
    where.push(`is_active = $${params.length}`);
  }
  const clause = where.join(" AND ");
  const total = Number(one((await countSuppliers({ query }, clause, params)).rows).count);
  params.push(page.pageSize, page.offset);
  const rows = await selectSuppliers({ query }, clause, params);
  return pageResult(rows.rows.map(mapSupplier), total, page);
}

export async function getSupplier(id: string) {
  return load({ query }, id);
}

export async function createSupplier(input: SupplierInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    assertPrimary(input);
    const row = one((await insertSupplier(client, values(input))).rows);
    await replaceAddresses(client, row.id, input.addresses);
    await replaceContacts(client, row.id, input.contacts);
    const saved = await load(client, row.id);
    await audit(client, meta, "suppliers.create", row.id, `Created supplier ${saved.code}`, null, saved);
    return saved;
  });
}

export async function updateSupplierProfile(id: string, input: SupplierInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    assertPrimary(input);
    const before = await load(client, id);
    await updateSupplier(client, id, values(input));
    await replaceAddresses(client, id, input.addresses);
    await replaceContacts(client, id, input.contacts);
    const saved = await load(client, id);
    await audit(client, meta, "suppliers.update", id, `Updated supplier ${saved.code}`, before, saved);
    return saved;
  });
}

export async function supplierBalance(id: string) {
  await load({ query }, id);
  const row = one((await selectExposure({ query }, id)).rows);
  return {
    supplierId: id,
    payables: money(row.payables),
    advances: money(row.advances),
  };
}

export async function supplierHistory(id: string, page: Page, filters: { from?: string; to?: string }) {
  await load({ query }, id);
  const from = filters.from ?? null;
  const to = filters.to ?? null;
  const total = Number(one((await countHistory({ query }, id, from, to)).rows).count);
  const rows = await selectHistory({ query }, id, [from, to, page.pageSize, page.offset]);
  return pageResult(rows.rows, total, page);
}

export async function supplierProducts(id: string) {
  await load({ query }, id);
  const rows = await selectSuppliersForProduct({ query }, id);
  return rows.rows.map((row) => ({
    productId: row.product_id,
    sku: row.sku,
    productName: row.product_name,
    supplierItemCode: row.supplier_item_code,
    purchasePrice: row.purchase_price,
    leadTimeDays: row.lead_time_days,
    isPreferred: row.is_preferred,
  }));
}

export async function saveOpeningDetails(input: OpeningDetailInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const line = one((await lockOpeningLine(client, input.journalLineId)).rows, "Journal line not found.");
    if (line.source_type !== "opening_balance") {
      throw new AppError(409, "OPENING_AP", "Supplier opening detail can only be attached to an opening-balance journal line.");
    }
    if (line.status === "void" || line.reversed_by_entry_id) {
      throw new AppError(409, "OPENING_AP", "Supplier opening detail cannot be attached to a voided or reversed journal.");
    }
    if (!line.ap_control_account_id || line.account_id !== line.ap_control_account_id) {
      throw new AppError(409, "OPENING_AP", "Supplier opening detail must use the payable control account.");
    }
    const net = decimal(line.credit).minus(decimal(line.debit));
    const sum = input.lines.reduce((total, item) => total.plus(decimal(item.amount)), decimal("0"));
    if (!sum.eq(net)) {
      throw new AppError(409, "OPENING_AP", "Supplier opening amounts must equal the payable line. This does not post another journal.");
    }
    const suppliers = await selectActiveSupplierIds(client, input.lines.map((item) => item.supplierId));
    if (suppliers.rows.length !== new Set(input.lines.map((item) => item.supplierId)).size) {
      throw new AppError(400, "VALIDATION", "Every opening amount must use an active supplier.");
    }
    await replaceOpeningDetails(client, input.journalLineId, input.lines.map((item) => ({
      supplierId: item.supplierId,
      amount: money(item.amount),
    })));
    const saved = { journalLineId: input.journalLineId, lines: input.lines.map((item) => ({ ...item, amount: money(item.amount) })), journalPosted: line.status === "posted" };
    await audit(client, meta, "suppliers.opening_detail", input.journalLineId, "Saved supplier opening detail without a second payable posting", null, saved);
    return saved;
  });
}

async function load(db: Sql, id: string) {
  const row = one((await selectSupplier(db, id)).rows, "Supplier not found.");
  const addresses = await selectAddresses(db, id);
  const contacts = await selectContacts(db, id);
  return {
    ...mapSupplier(row),
    addresses: addresses.rows.map((address) => ({
      id: address.id,
      addressType: address.address_type,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postal_code,
      countryCode: address.country_code,
      isPrimary: address.is_primary,
    })),
    contacts: contacts.rows.map((contact) => ({
      id: contact.id,
      name: contact.name,
      roleTitle: contact.role_title,
      phone: contact.phone,
      email: contact.email,
      isPrimary: contact.is_primary,
    })),
  };
}

function mapSupplier(row: SupplierRow) {
  return {
    id: row.id,
    code: row.code,
    legalName: row.legal_name,
    displayName: row.display_name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    taxIdentifier: row.tax_identifier,
    taxCountryCode: row.tax_country_code,
    partyType: row.party_type,
    cnicNtn: row.cnic_ntn,
    ntnCheckDigit: row.ntn_check_digit,
    cnicNtnDisplay: displayCnicNtn(row.party_type, row.cnic_ntn, row.ntn_check_digit),
    strn: row.strn,
    paymentTermsDays: row.payment_terms_days,
    isActive: row.is_active,
    notes: row.notes,
  };
}

function values(input: SupplierInput) {
  const country = taxCountry(input);
  const pakistan = country === "PK" ? pakistanValues(input) : [null, null, null, null];
  return [
    input.code,
    input.legalName,
    input.displayName,
    input.contactName ?? null,
    input.phone ?? null,
    empty(input.email),
    empty(input.taxIdentifier),
    country,
    ...pakistan,
    input.paymentTermsDays,
    input.isActive,
    input.notes ?? null,
  ];
}

function taxCountry(input: SupplierInput) {
  const country = input.taxCountryCode?.trim().toUpperCase() || null;
  if (country && !/^[A-Z]{2}$/.test(country)) {
    throw new AppError(400, "VALIDATION", "Tax country must be a two-letter code.");
  }
  return country;
}

function pakistanValues(input: SupplierInput) {
  if (!input.partyType || !input.cnicNtn?.trim()) {
    throw new AppError(400, "VALIDATION", "A Pakistan supplier needs a party type and a CNIC/NTN. The tax country does not choose a tax rate.");
  }
  const parsed = parseCnicNtn(input.partyType as PartyType, input.cnicNtn);
  return [input.partyType, parsed.canonical, parsed.ntnCheckDigit, empty(input.strn)];
}

function assertPrimary(input: SupplierInput) {
  if (input.addresses.filter((address) => address.isPrimary).length > 1) {
    throw new AppError(400, "VALIDATION", "A supplier can have one primary address.");
  }
  if (input.contacts.filter((contact) => contact.isPrimary).length > 1) {
    throw new AppError(400, "VALIDATION", "A supplier can have one primary contact.");
  }
}

function empty(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function audit(db: Sql, meta: RequestMeta, action: string, id: string, summary: string, before: unknown, after: unknown) {
  return writeAudit(db, {
    actorUserId: meta.actor.id,
    action,
    entityType: "supplier",
    entityId: id,
    summary,
    before,
    after,
    ipAddress: meta.ipAddress,
    requestId: meta.requestId,
  });
}
