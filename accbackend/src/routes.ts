import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { toCsv } from "./lib/csv";
import { AppError } from "./lib/errors";
import { parseBody, parseQuery, wrap, clientIp } from "./lib/http";
import { pageQuery, toPage } from "./lib/pagination";
import { actorFrom, requireAuth, requirePermission } from "./middleware/auth";
import { changePassword, login, logout, publicUser } from "./modules/auth/service";
import { createAccount, deleteAccount, listAccounts, updateAccount } from "./modules/accounts/service";
import { createBranch, listBranches, updateBranch } from "./modules/branches/service";
import { getCompany, updateCompany } from "./modules/company/service";
import { getDashboard } from "./modules/dashboard/service";
import {
  approveJournal,
  createJournal,
  getJournal,
  listJournals,
  postJournal,
  rejectJournal,
  reverseJournal,
  submitJournal,
  updateJournal,
  voidJournal,
} from "./modules/journals/service";
import { listSequences, updateSequence } from "./modules/numbering/service";
import { closePeriod, closeYear, createFiscalYear, listFiscalYears, reopenPeriod, reopenYear } from "./modules/periods/service";
import { balanceSheet, generalLedger, journalReport, profitAndLoss, trialBalance } from "./modules/reports/service";
import {
  createTaxCode,
  getAccountingProfile,
  listTaxCodes,
  retireTaxCode,
  updateAccountingProfile,
} from "./modules/tax/service";
import { createRole, createUser, listPermissionCatalog, listRoles, listUsers, updateRole, updateUser } from "./modules/users/service";
import { query } from "./db/pool";

const amount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "Amount must be a decimal string");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reason = z.object({ reason: z.string().trim().min(3).max(500) });
const country = z.string().regex(/^[A-Za-z]{2}$/);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMIT", message: "Too many sign-in attempts. Try again later." } },
});

export const authRouter = Router();
authRouter.post("/login", loginLimiter, wrap(async (req, res) => {
  const body = parseBody(z.object({ email: z.string().email(), password: z.string().min(1).max(200) }), req.body);
  res.json(await login(body.email, body.password, clientIp(req), req.requestId ?? null));
}));
authRouter.get("/me", requireAuth, wrap(async (req, res) => {
  res.json({ user: publicUser(actorFrom(req).actor) });
}));
authRouter.post("/change-password", requireAuth, wrap(async (req, res) => {
  const body = parseBody(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1).max(200) }), req.body);
  const meta = actorFrom(req);
  res.json(await changePassword(meta.actor, body.currentPassword, body.newPassword, meta.ipAddress, meta.requestId));
}));
authRouter.post("/logout", requireAuth, wrap(async (req, res) => {
  const meta = actorFrom(req);
  await logout(meta.actor, meta.ipAddress, meta.requestId);
  res.status(204).end();
}));

const journalBody = z.object({
  entryDate: isoDate,
  description: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(80).nullish(),
  sourceType: z.enum(["manual", "opening_balance"]).default("manual"),
  lines: z.array(z.object({
    accountId: z.string().uuid(),
    branchId: z.string().uuid().nullish(),
    description: z.string().trim().max(300).nullish(),
    debit: amount,
    credit: amount,
  })).min(1).max(200),
});

const accountBody = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  accountType: z.enum(["asset", "liability", "equity", "income", "expense"]),
  accountSubtype: z.string().trim().max(60).nullish(),
  parentId: z.string().uuid().nullish(),
  isHeader: z.boolean(),
  isControl: z.boolean(),
  isActive: z.boolean(),
  description: z.string().trim().max(500).nullish(),
});

const branchBody = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  isActive: z.boolean(),
  line1: z.string().trim().max(160).nullish(),
  city: z.string().trim().max(80).nullish(),
  region: z.string().trim().max(80).nullish(),
  countryCode: country.nullish(),
});

const userBody = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(160),
  isActive: z.boolean(),
  password: z.string().min(1).max(200).optional(),
  roleIds: z.array(z.string().uuid()),
  branchIds: z.array(z.string().uuid()),
});

export const apiRouter = Router();

apiRouter.get("/dashboard", wrap(async (req, res) => {
  res.json(await getDashboard(actorFrom(req).actor));
}));

apiRouter.get("/company", requirePermission("company.view"), wrap(async (_req, res) => {
  res.json(await getCompany());
}));
apiRouter.put("/company", requirePermission("company.update"), wrap(async (req, res) => {
  const body = parseBody(z.object({
    legalName: z.string().trim().min(1).max(200),
    displayName: z.string().trim().min(1).max(200),
    countryCode: country,
    taxIdentifier: z.string().trim().max(80).nullish(),
    timezone: z.string().trim().min(1).max(80),
    currencyName: z.string().trim().min(1).max(40),
    currencySymbol: z.string().trim().min(1).max(8),
    currencyDecimalPlaces: z.number().int().min(0).max(4),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
    requireDistinctApprover: z.boolean(),
    logoUrl: z.string().trim().max(500).nullish(),
    notes: z.string().trim().max(2000).nullish(),
    addresses: z.array(z.object({
      id: z.string().uuid().optional(),
      addressType: z.enum(["registered", "billing", "other"]),
      line1: z.string().trim().min(1).max(160),
      line2: z.string().trim().max(160).nullish(),
      city: z.string().trim().max(80).nullish(),
      region: z.string().trim().max(80).nullish(),
      postalCode: z.string().trim().max(24).nullish(),
      countryCode: country,
      isPrimary: z.boolean(),
    })).max(20),
    contacts: z.array(z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(160),
      roleTitle: z.string().trim().max(80).nullish(),
      phone: z.string().trim().max(40).nullish(),
      email: z.string().email().nullish(),
      isPrimary: z.boolean(),
    })).max(30),
  }), req.body);
  res.json(await updateCompany(body, actorFrom(req)));
}));

apiRouter.get("/numbering", requirePermission("numbering.view"), wrap(async (_req, res) => {
  res.json({ data: await listSequences() });
}));
apiRouter.put("/numbering/:docType", requirePermission("numbering.update"), wrap(async (req, res) => {
  const body = parseBody(z.object({
    prefix: z.string().max(12),
    nextNumber: z.number().int().min(1),
    padLength: z.number().int().min(1).max(12),
  }), req.body);
  res.json(await updateSequence(req.params.docType, body, actorFrom(req)));
}));

apiRouter.get("/accounting-profile", requirePermission("accounting_profile.view"), wrap(async (_req, res) => {
  res.json(await getAccountingProfile());
}));
apiRouter.put("/accounting-profile", requirePermission("accounting_profile.update"), wrap(async (req, res) => {
  const body = parseBody(z.object({
    countryCode: country,
    name: z.string().trim().min(1).max(120),
    complianceStatus: z.enum(["unverified", "reviewed"]),
    notes: z.string().trim().max(2000).nullish(),
  }), req.body);
  res.json(await updateAccountingProfile(body, actorFrom(req)));
}));

apiRouter.get("/tax-codes", requirePermission("tax_codes.view"), wrap(async (_req, res) => {
  res.json({ data: await listTaxCodes() });
}));
apiRouter.post("/tax-codes", requirePermission("tax_codes.manage"), wrap(async (req, res) => {
  const body = parseBody(z.object({
    code: z.string().trim().min(1).max(32),
    name: z.string().trim().min(1).max(160),
    ratePercent: amount,
    salesAccountId: z.string().uuid().nullish(),
    purchaseAccountId: z.string().uuid().nullish(),
    effectiveFrom: isoDate,
  }), req.body);
  res.status(201).json(await createTaxCode(body, actorFrom(req)));
}));
apiRouter.post("/tax-codes/:id/retire", requirePermission("tax_codes.manage"), wrap(async (req, res) => {
  const body = parseBody(z.object({ effectiveTo: isoDate }), req.body);
  res.json(await retireTaxCode(req.params.id, body.effectiveTo, actorFrom(req)));
}));

apiRouter.get("/branches", requirePermission("branches.view"), wrap(async (req, res) => {
  const queryInput = parseQuery(pageQuery.extend({ search: z.string().optional() }), req.query);
  res.json(await listBranches(toPage(queryInput), queryInput.search));
}));
apiRouter.post("/branches", requirePermission("branches.create"), wrap(async (req, res) => {
  res.status(201).json(await createBranch(parseBody(branchBody, req.body), actorFrom(req)));
}));
apiRouter.put("/branches/:id", requirePermission("branches.update"), wrap(async (req, res) => {
  res.json(await updateBranch(req.params.id, parseBody(branchBody, req.body), actorFrom(req)));
}));

apiRouter.get("/users", requirePermission("users.view"), wrap(async (req, res) => {
  const queryInput = parseQuery(pageQuery.extend({ search: z.string().optional() }), req.query);
  res.json(await listUsers(toPage(queryInput), queryInput.search));
}));
apiRouter.post("/users", requirePermission("users.create"), wrap(async (req, res) => {
  res.status(201).json(await createUser(parseBody(userBody, req.body), actorFrom(req)));
}));
apiRouter.put("/users/:id", requirePermission("users.update"), wrap(async (req, res) => {
  res.json(await updateUser(req.params.id, parseBody(userBody, req.body), actorFrom(req)));
}));

apiRouter.get("/permissions", requirePermission("roles.view"), wrap(async (_req, res) => {
  res.json({ data: await listPermissionCatalog() });
}));
apiRouter.get("/roles", requirePermission("roles.view"), wrap(async (_req, res) => {
  res.json({ data: await listRoles() });
}));
apiRouter.post("/roles", requirePermission("roles.create"), wrap(async (req, res) => {
  const body = parseBody(z.object({
    code: z.string().trim().regex(/^[a-z0-9_]+$/).max(40),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).nullish(),
    permissions: z.array(z.string()),
  }), req.body);
  res.status(201).json(await createRole(body, actorFrom(req)));
}));
apiRouter.put("/roles/:id", requirePermission("roles.update"), wrap(async (req, res) => {
  const body = parseBody(z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).nullish(),
    permissions: z.array(z.string()),
  }), req.body);
  res.json(await updateRole(req.params.id, body, actorFrom(req)));
}));

apiRouter.get("/accounts", requirePermission("accounts.view"), wrap(async (req, res) => {
  const queryInput = parseQuery(pageQuery.extend({
    search: z.string().optional(),
    postable: z.enum(["true", "false"]).optional(),
  }), req.query);
  res.json(await listAccounts(toPage(queryInput), queryInput.search, queryInput.postable === "true"));
}));
apiRouter.post("/accounts", requirePermission("accounts.create"), wrap(async (req, res) => {
  res.status(201).json(await createAccount(parseBody(accountBody, req.body), actorFrom(req)));
}));
apiRouter.put("/accounts/:id", requirePermission("accounts.update"), wrap(async (req, res) => {
  res.json(await updateAccount(req.params.id, parseBody(accountBody, req.body), actorFrom(req)));
}));
apiRouter.delete("/accounts/:id", requirePermission("accounts.update"), wrap(async (req, res) => {
  res.json(await deleteAccount(req.params.id, actorFrom(req)));
}));

apiRouter.get("/fiscal-years", requirePermission("periods.view"), wrap(async (_req, res) => {
  res.json({ data: await listFiscalYears() });
}));
apiRouter.post("/fiscal-years", requirePermission("periods.manage"), wrap(async (req, res) => {
  const body = parseBody(z.object({ startDate: isoDate }), req.body);
  res.status(201).json(await createFiscalYear(body.startDate, actorFrom(req)));
}));
apiRouter.post("/fiscal-years/:id/close", requirePermission("periods.close"), wrap(async (req, res) => {
  const body = parseBody(reason, req.body);
  res.json(await closeYear(req.params.id, body.reason, actorFrom(req)));
}));
apiRouter.post("/fiscal-years/:id/reopen", requirePermission("periods.reopen"), wrap(async (req, res) => {
  const body = parseBody(reason, req.body);
  res.json(await reopenYear(req.params.id, body.reason, actorFrom(req)));
}));
apiRouter.post("/fiscal-periods/:id/close", requirePermission("periods.close"), wrap(async (req, res) => {
  const body = parseBody(reason, req.body);
  res.json(await closePeriod(req.params.id, body.reason, actorFrom(req)));
}));
apiRouter.post("/fiscal-periods/:id/reopen", requirePermission("periods.reopen"), wrap(async (req, res) => {
  const body = parseBody(reason, req.body);
  res.json(await reopenPeriod(req.params.id, body.reason, actorFrom(req)));
}));

apiRouter.get("/journals", requirePermission("journals.view"), wrap(async (req, res) => {
  const queryInput = parseQuery(pageQuery.extend({
    status: z.enum(["draft", "pending_approval", "approved", "posted", "void"]).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    search: z.string().optional(),
  }), req.query);
  res.json(await listJournals(actorFrom(req).actor, toPage(queryInput), queryInput));
}));
apiRouter.post("/journals", requirePermission("journals.create"), wrap(async (req, res) => {
  res.status(201).json(await createJournal(parseBody(journalBody, req.body), actorFrom(req)));
}));
apiRouter.get("/journals/:id", requirePermission("journals.view"), wrap(async (req, res) => {
  res.json(await getJournal(req.params.id, actorFrom(req).actor));
}));
apiRouter.put("/journals/:id", requirePermission("journals.update"), wrap(async (req, res) => {
  res.json(await updateJournal(req.params.id, parseBody(journalBody, req.body), actorFrom(req)));
}));
apiRouter.post("/journals/:id/submit", requirePermission("journals.submit"), wrap(async (req, res) => {
  res.json(await submitJournal(req.params.id, actorFrom(req)));
}));
apiRouter.post("/journals/:id/reject", requirePermission("journals.approve"), wrap(async (req, res) => {
  const body = parseBody(reason, req.body);
  res.json(await rejectJournal(req.params.id, body.reason, actorFrom(req)));
}));
apiRouter.post("/journals/:id/approve", requirePermission("journals.approve"), wrap(async (req, res) => {
  res.json(await approveJournal(req.params.id, actorFrom(req)));
}));
apiRouter.post("/journals/:id/post", requirePermission("journals.post"), wrap(async (req, res) => {
  const body = parseBody(z.object({ postingDate: isoDate.optional() }), req.body ?? {});
  res.json(await postJournal(req.params.id, body.postingDate, actorFrom(req)));
}));
apiRouter.post("/journals/:id/void", requirePermission("journals.void"), wrap(async (req, res) => {
  const body = parseBody(reason, req.body);
  res.json(await voidJournal(req.params.id, body.reason, actorFrom(req)));
}));
apiRouter.post("/journals/:id/reverse", requirePermission("journals.reverse"), wrap(async (req, res) => {
  const body = parseBody(reason.extend({ postingDate: isoDate.optional() }), req.body);
  res.json(await reverseJournal(req.params.id, body, actorFrom(req)));
}));

apiRouter.get("/reports/trial-balance", requirePermission("reports.view"), wrap(async (req, res) => {
  const filters = reportFilters(req.query);
  const report = await trialBalance(actorFrom(req).actor, filters);
  if (!wantsCsv(req)) return res.json(report);
  sendCsv(res, "trial-balance.csv", ["Code", "Name", "Type", "Debit", "Credit"], report.rows.map((row) => [
    row.code, row.name, row.accountType, row.debitBalance, row.creditBalance,
  ]));
}));
apiRouter.get("/reports/profit-and-loss", requirePermission("reports.view"), wrap(async (req, res) => {
  const filters = reportFilters(req.query);
  const report = await profitAndLoss(actorFrom(req).actor, filters);
  if (!wantsCsv(req)) return res.json(report);
  sendCsv(res, "profit-and-loss.csv", ["Code", "Name", "Type", "Amount"], report.rows.map((row) => [
    row.code, row.name, row.accountType, row.amount,
  ]));
}));
apiRouter.get("/reports/balance-sheet", requirePermission("reports.view"), wrap(async (req, res) => {
  const filters = reportFilters(req.query);
  const report = await balanceSheet(actorFrom(req).actor, filters);
  if (!wantsCsv(req)) return res.json(report);
  const rows = [
    ...report.assets.map((row) => ["asset", row.code, row.name, row.amount]),
    ...report.liabilities.map((row) => ["liability", row.code, row.name, row.amount]),
    ...report.equity.map((row) => ["equity", row.code, row.name, row.amount]),
    ["equity", "", "Unclosed profit or loss", report.unclosedProfitOrLoss],
  ];
  sendCsv(res, "balance-sheet.csv", ["Section", "Code", "Name", "Amount"], rows);
}));
apiRouter.get("/reports/general-ledger", requirePermission("reports.view"), wrap(async (req, res) => {
  const filters = reportFilters(req.query);
  const report = await generalLedger(actorFrom(req).actor, filters);
  if (!wantsCsv(req)) return res.json(report);
  sendCsv(res, "general-ledger.csv", ["Entry", "Transaction date", "Posting date", "Description", "Debit", "Credit", "Balance"], report.lines.map((line) => [
    line.entryNumber, line.entryDate, line.postingDate, line.description ?? "", line.debit, line.credit, line.runningBalance,
  ]));
}));
apiRouter.get("/reports/journals", requirePermission("reports.view"), wrap(async (req, res) => {
  const filters = reportFilters(req.query);
  const report = await journalReport(actorFrom(req).actor, filters);
  if (!wantsCsv(req)) return res.json(report);
  sendCsv(res, "journals.csv", ["Entry", "Transaction date", "Posting date", "Account", "Debit", "Credit", "Description"], report.rows.map((row) => [
    row.entryNumber, row.entryDate, row.postingDate, row.accountCode, row.debit, row.credit, row.lineDescription ?? row.description,
  ]));
}));

apiRouter.get("/audit", requirePermission("audit.view"), wrap(async (req, res) => {
  const queryInput = parseQuery(pageQuery.extend({
    entityType: z.string().max(60).optional(),
    entityId: z.string().max(80).optional(),
  }), req.query);
  const page = toPage(queryInput);
  const params: unknown[] = [];
  const where = ["TRUE"];
  if (queryInput.entityType) {
    params.push(queryInput.entityType);
    where.push(`entity_type = $${params.length}`);
  }
  if (queryInput.entityId) {
    params.push(queryInput.entityId);
    where.push(`entity_id = $${params.length}`);
  }
  const clause = where.join(" AND ");
  const total = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM audit_log WHERE ${clause}`, params);
  const rows = await query(
    `SELECT id, occurred_at, actor_user_id, action, entity_type, entity_id, summary, before_data, after_data
       FROM audit_log WHERE ${clause}
      ORDER BY occurred_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, page.offset],
  );
  res.json({
    data: rows.rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
      actorUserId: row.actor_user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      summary: row.summary,
      before: row.before_data,
      after: row.after_data,
    })),
    page: page.page,
    pageSize: page.pageSize,
    total: Number(total.rows[0].count),
  });
}));

function reportFilters(input: unknown) {
  return parseQuery(z.object({
    asOf: isoDate.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    branchId: z.string().uuid().optional(),
    accountId: z.string().uuid().optional(),
    format: z.enum(["csv"]).optional(),
  }), input);
}

function wantsCsv(req: { query: unknown; user?: { isCompanyAdmin: boolean; permissions: string[] } }) {
  const format = typeof req.query === "object" && req.query && "format" in req.query ? req.query.format : undefined;
  if (format !== "csv") return false;
  const user = req.user;
  if (!user?.isCompanyAdmin && !user?.permissions.includes("reports.export")) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to export reports.");
  }
  return true;
}

function sendCsv(res: { setHeader: (name: string, value: string) => void; send: (body: string) => void }, filename: string, headers: string[], rows: string[][]) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(toCsv(headers, rows));
}
