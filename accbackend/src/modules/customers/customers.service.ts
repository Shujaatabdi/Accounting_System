import { query, type Sql } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { AppError, one } from "../../shared/errors";
import { decimal, money } from "../../shared/money";
import { pageResult, type Page } from "../../shared/http/pagination";
import type { RequestMeta } from "../auth/auth.types";
import {
  countCustomers,
  countHistory,
  insertCustomer,
  saveCustomerAtl,
  savePakistanTaxProfile,
  lockOpeningLine,
  replaceAddresses,
  replaceContacts,
  replaceOpeningDetails,
  selectActiveCustomerIds,
  selectAddresses,
  selectContacts,
  selectCustomer,
  selectCustomers,
  selectExposure,
  selectHistory,
  updateCustomer,
  type CustomerRow,
} from "./customers.repository";
import { selectCompanyCountry } from "../company/company.repository";
import { atlRecordingApplies, parseAtlInput, type AtlInput } from "../../shared/atl";
import { displayCnicNtn, parseCnicNtn, type PartyType } from "./customer-tax";
import type { CustomerInput, OpeningDetailInput } from "./customers.types";

export async function listCustomers(page: Page, filters: { search?: string; active?: string }) {
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
  const total = Number(one((await countCustomers({ query }, clause, params)).rows).count);
  params.push(page.pageSize, page.offset);
  const rows = await selectCustomers({ query }, clause, params);
  const country = await installationCountry({ query });
  return pageResult(rows.rows.map((row) => mapCustomer(row, country)), total, page);
}

export async function getCustomer(id: string) {
  return load({ query }, id);
}

export async function createCustomer(input: CustomerInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    assertPrimary(input);
    const row = one((await insertCustomer(client, values(input))).rows);
    if (taxCountry(input) === "PK") await savePakistanTaxProfile(client, row.id, pakistanValues(input));
    await replaceAddresses(client, row.id, input.addresses);
    await replaceContacts(client, row.id, input.contacts);
    const saved = await load(client, row.id);
    await audit(client, meta, "customers.create", row.id, `Created customer ${saved.code}`, null, saved);
    return saved;
  });
}

export async function updateCustomerProfile(id: string, input: CustomerInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    assertPrimary(input);
    const before = await load(client, id);
    await updateCustomer(client, id, values(input));
    if (taxCountry(input) === "PK") await savePakistanTaxProfile(client, id, pakistanValues(input));
    await replaceAddresses(client, id, input.addresses);
    await replaceContacts(client, id, input.contacts);
    const saved = await load(client, id);
    await audit(client, meta, "customers.update", id, `Updated customer ${saved.code}`, before, saved);
    return saved;
  });
}

export async function recordCustomerAtl(id: string, input: AtlInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const before = await load(client, id);
    if (!atlRecordingApplies(await installationCountry(client), before.taxCountryCode)) {
      throw new AppError(409, "ATL_CONTEXT", "Manual ATL recording is available only when the company country and this customer's tax country are both Pakistan. The stored ATL record is left unchanged. This does not select a tax rate.");
    }
    const parsed = parseAtlInput(input);
    await saveCustomerAtl(client, id, parsed.status, parsed.checkedAt, parsed.reference, parsed.status ? meta.actor.id : null);
    const saved = await load(client, id);
    await audit(client, meta, parsed.status ? "customers.record_atl" : "customers.clear_atl", id, parsed.status ? `Recorded manual ATL for ${saved.code}` : `Cleared manual ATL for ${saved.code}`, before.atl, saved.atl);
    return saved;
  });
}

export async function customerBalance(id: string) {
  await load({ query }, id);
  const row = one((await selectExposure({ query }, id)).rows);
  const receivables = decimal(row.receivables);
  const advances = decimal(row.advances);
  return {
    customerId: id,
    receivables: money(receivables),
    advances: money(advances),
    exposure: money(receivables.minus(advances)),
  };
}

export async function customerHistory(id: string, page: Page, filters: { from?: string; to?: string }) {
  await load({ query }, id);
  const from = filters.from ?? null;
  const to = filters.to ?? null;
  const total = Number(one((await countHistory({ query }, id, from, to)).rows).count);
  const rows = await selectHistory({ query }, id, [from, to, page.pageSize, page.offset]);
  return pageResult(rows.rows, total, page);
}

export async function saveOpeningDetails(input: OpeningDetailInput, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const line = one((await lockOpeningLine(client, input.journalLineId)).rows, "Journal line not found.");
    if (line.source_type !== "opening_balance") {
      throw new AppError(409, "OPENING_AR", "Customer opening detail can only be attached to an opening-balance journal line.");
    }
    if (line.status === "void" || line.reversed_by_entry_id) {
      throw new AppError(409, "OPENING_AR", "Customer opening detail cannot be attached to a voided or reversed journal.");
    }
    if (!line.ar_control_account_id || line.account_id !== line.ar_control_account_id) {
      throw new AppError(409, "OPENING_AR", "Customer opening detail must use the receivable control account.");
    }
    const net = decimal(line.debit).minus(decimal(line.credit));
    const sum = input.lines.reduce((total, item) => total.plus(decimal(item.amount)), decimal("0"));
    if (!sum.eq(net)) {
      throw new AppError(409, "OPENING_AR", "Customer opening amounts must equal the receivable line. This does not post another journal.");
    }
    const customers = await selectActiveCustomerIds(client, input.lines.map((item) => item.customerId));
    if (customers.rows.length !== new Set(input.lines.map((item) => item.customerId)).size) {
      throw new AppError(400, "VALIDATION", "Every opening amount must use an active customer.");
    }
    await replaceOpeningDetails(client, input.journalLineId, input.lines.map((item) => ({
      customerId: item.customerId,
      amount: money(item.amount),
    })));
    const saved = { journalLineId: input.journalLineId, lines: input.lines.map((item) => ({ ...item, amount: money(item.amount) })), journalPosted: line.status === "posted" };
    await audit(client, meta, "customers.opening_detail", input.journalLineId, "Saved customer opening detail without a second receivable posting", null, saved);
    return saved;
  });
}

async function load(db: Sql, id: string) {
  const row = one((await selectCustomer(db, id)).rows, "Customer not found.");
  const country = await installationCountry(db);
  const addresses = await selectAddresses(db, id);
  const contacts = await selectContacts(db, id);
  return {
    ...mapCustomer(row, country),
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

function mapCustomer(row: CustomerRow, companyCountry: string) {
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
    atlApplicable: atlRecordingApplies(companyCountry, row.tax_country_code),
    atl: mapAtl(row),
    paymentTermsDays: row.payment_terms_days,
    creditLimit: row.credit_limit,
    isActive: row.is_active,
    notes: row.notes,
  };
}

function values(input: CustomerInput) {
  return [
    input.code,
    input.legalName,
    input.displayName,
    input.contactName ?? null,
    input.phone ?? null,
    empty(input.email),
    empty(input.taxIdentifier),
    taxCountry(input),
    input.paymentTermsDays,
    input.creditLimit ? money(input.creditLimit) : null,
    input.isActive,
    input.notes ?? null,
  ];
}

function mapAtl(row: { atl_status: string | null; atl_checked_at: string | null; atl_reference: string | null; atl_recorded_by_name: string | null; atl_recorded_at: string | null }) {
  if (row.atl_status !== "active" && row.atl_status !== "inactive") return null;
  return {
    status: row.atl_status,
    checkedAt: row.atl_checked_at,
    reference: row.atl_reference,
    recordedByName: row.atl_recorded_by_name,
    recordedAt: row.atl_recorded_at,
    manuallyEntered: true,
    verifiedByApplication: false,
  };
}

async function installationCountry(db: Sql) {
  return one((await selectCompanyCountry(db)).rows, "Company is not configured.").country_code;
}

function taxCountry(input: CustomerInput) {
  const country = input.taxCountryCode?.trim().toUpperCase() || null;
  if (country && !/^[A-Z]{2}$/.test(country)) {
    throw new AppError(400, "VALIDATION", "Tax country must be a two-letter code.");
  }
  return country;
}

function pakistanValues(input: CustomerInput) {
  if (!input.partyType || !input.cnicNtn?.trim()) {
    throw new AppError(400, "VALIDATION", "A Pakistan customer needs a party type and a CNIC/NTN. The tax country does not choose a tax rate.");
  }
  const parsed = parseCnicNtn(input.partyType as PartyType, input.cnicNtn);
  return [input.partyType, parsed.canonical, parsed.ntnCheckDigit, empty(input.strn)];
}

function assertPrimary(input: CustomerInput) {
  if (input.addresses.filter((address) => address.isPrimary).length > 1) {
    throw new AppError(400, "VALIDATION", "A customer can have one primary address.");
  }
  if (input.contacts.filter((contact) => contact.isPrimary).length > 1) {
    throw new AppError(400, "VALIDATION", "A customer can have one primary contact.");
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
    entityType: "customer",
    entityId: id,
    summary,
    before,
    after,
    ipAddress: meta.ipAddress,
    requestId: meta.requestId,
  });
}
