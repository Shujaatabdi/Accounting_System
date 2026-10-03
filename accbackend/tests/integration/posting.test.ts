import assert from "node:assert/strict";
import { execFile, execFileSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import EmbeddedPostgres from "embedded-postgres";
import request from "supertest";
import type { Express } from "express";

const port = 54329;
const databaseDir = path.join(os.tmpdir(), `acc-foundation-${process.pid}`);
let postgres: EmbeddedPostgres | undefined;
let app: Express;
let token = "";
let cleanupTask: Promise<void> | undefined;

// embedded-postgres stop() on Windows waits forever for a Node child "exit"
// event after taskkill. Clear its handle and shut the cluster down with pg_ctl,
// which also stops auxiliary processes and returns when the postmaster is gone.
function stopTemporaryDatabase(): Promise<void> {
  cleanupTask ??= cleanupTemporaryDatabase();
  return cleanupTask;
}

function pgCtlBinary(): string {
  const platformName = process.platform === "win32" ? "windows" : process.platform;
  const entry = createRequire(import.meta.url).resolve(
    `@embedded-postgres/${platformName}-${process.arch}`,
  );
  const executable = process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl";
  return path.resolve(path.dirname(entry), "..", "native", "bin", executable);
}

function assertSafeDataDir(): void {
  const root = path.resolve(os.tmpdir());
  const resolved = path.resolve(databaseDir);
  const relative = path.relative(root, resolved);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !path.basename(resolved).startsWith("acc-foundation-")
  ) {
    throw new Error(`Refusing to clean a database outside the temporary test directory: ${resolved}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runPgCtl(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    execFile(pgCtlBinary(), args, { timeout: 30_000, windowsHide: true }, (error, stdout, stderr) => {
      const output = `${stdout ?? ""}${stderr ?? ""}${error?.message ?? ""}`;
      if (error && "killed" in error && error.killed) {
        reject(new Error(`pg_ctl did not finish: ${args.join(" ")}\n${output}`));
        return;
      }
      const code = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
      resolve({ code, output });
    });
  });
}

function serverIsStopped(output: string): boolean {
  const text = output.toLowerCase();
  return (
    text.includes("no server running") ||
    text.includes("is server running") ||
    text.includes("does not exist")
  );
}

function processCommandLine(pid: number): string | null {
  if (process.platform === "win32") {
    const script = `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($null -eq $p) { '' } else { $p.CommandLine }`;
    try {
      return execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
        encoding: "utf8",
        timeout: 20_000,
        windowsHide: true,
      }).trim() || null;
    } catch (error) {
      throw new Error(`Could not confirm which process owns temporary PostgreSQL pid ${pid}.`, { cause: error });
    }
  }
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "args="], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
    }).trim() || null;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return null;
    throw new Error(`Could not confirm which process owns temporary PostgreSQL pid ${pid}.`, { cause: error });
  }
}

// Returns the live temporary postmaster, or undefined when that process is already gone.
function temporaryPostmasterPid(): number | undefined {
  const pidFile = path.join(databaseDir, "postmaster.pid");
  const lines = fs.readFileSync(pidFile, "utf8").split(/\r?\n/);
  const pid = Number(lines[0]);
  const recordedDir = lines[1]?.trim() ?? "";
  const recordedPort = lines[3]?.trim() ?? "";
  const sameDir = path.resolve(recordedDir).toLowerCase() === path.resolve(databaseDir).toLowerCase();
  if (!Number.isInteger(pid) || pid <= 0 || !sameDir || recordedPort !== String(port)) {
    throw new Error(`Refusing to stop PostgreSQL because ${pidFile} does not belong to the temporary test cluster.`);
  }
  const commandLine = processCommandLine(pid);
  if (!commandLine) return undefined;
  const folded = commandLine.replaceAll("\\", "/").toLowerCase();
  const expectedDir = path.resolve(databaseDir).replaceAll("\\", "/").toLowerCase();
  if (!folded.includes("postgres") || !folded.includes(expectedDir) || !folded.includes(`-p ${port}`)) {
    throw new Error(`Refusing to stop process ${pid} because it is not the temporary test cluster.`);
  }
  return pid;
}

async function requestShutdown(): Promise<void> {
  const fast = await runPgCtl(["stop", "-D", databaseDir, "-m", "fast", "-w", "-t", "20"]);
  if (fast.code === 0 || serverIsStopped(fast.output)) return;
  const immediate = await runPgCtl(["stop", "-D", databaseDir, "-m", "immediate", "-w", "-t", "20"]);
  if (immediate.code === 0 || serverIsStopped(immediate.output)) return;
  throw new Error(`Temporary PostgreSQL did not shut down.\n${immediate.output || fast.output}`);
}

function releaseClusterHandle(): ChildProcess | undefined {
  const instance = postgres as (EmbeddedPostgres & { process?: ChildProcess }) | undefined;
  const child = instance?.process;
  if (instance) instance.process = undefined;
  if (!child) return undefined;
  child.removeAllListeners();
  child.unref();
  return child;
}

async function removeDatabaseDir(): Promise<void> {
  assertSafeDataDir();
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(databaseDir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "EPERM" && code !== "ENOTEMPTY") throw error;
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError;
}

async function cleanupTemporaryDatabase(): Promise<void> {
  assertSafeDataDir();
  let postmasterPid: number | undefined;
  let child: ChildProcess | undefined;
  try {
    if (fs.existsSync(path.join(databaseDir, "postmaster.pid"))) {
      postmasterPid = temporaryPostmasterPid();
    }
  } finally {
    child = releaseClusterHandle();
  }
  let shutDown = postmasterPid === undefined;
  try {
    if (postmasterPid !== undefined) {
      await requestShutdown();
      shutDown = true;
    }
    const { closePool } = await import("../../src/db/pool");
    await closePool();
  } finally {
    child?.stdout?.destroy();
    child?.stderr?.destroy();
    if (shutDown) await removeDatabaseDir();
  }
}

before(async () => {
  assertSafeDataDir();
  fs.rmSync(databaseDir, { recursive: true, force: true });
  postgres = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
  });
  postgres.stop = () => stopTemporaryDatabase();
  try {
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase("accounting");
    process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/accounting`;
    process.env.JWT_SECRET = "integration-test-secret-value";
    process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "ChangeMe-Local-1";
    process.env.NODE_ENV = "test";
    process.env.CORS_ORIGIN = "http://localhost:3000";
    const { migrate } = await import("../../src/db/migrate");
    const { seed } = await import("../../src/db/seed");
    await migrate();
    await seed();
    const { createApp } = await import("../../src/app");
    app = createApp();
  } catch (error) {
    await stopTemporaryDatabase().catch(() => undefined);
    throw error;
  }
});

after(async () => {
  await stopTemporaryDatabase();
});

test("posted journals balance, stay immutable, and reverse without changing the trial balance", async () => {
  const login = await request(app).post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "ChangeMe-Local-1",
  });
  assert.equal(login.status, 200);
  const changed = await request(app)
    .post("/api/v1/auth/change-password")
    .set("Authorization", `Bearer ${login.body.token}`)
    .send({ currentPassword: "ChangeMe-Local-1", newPassword: "Changed-Local-2" });
  assert.equal(changed.status, 200);
  token = changed.body.token;

  const accounts = await request(app)
    .get("/api/v1/accounts?postable=true&pageSize=100")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(accounts.status, 200);
  const cash = accounts.body.data.find((row: { code: string }) => row.code === "1110");
  const equity = accounts.body.data.find((row: { code: string }) => row.code === "3100");
  assert.ok(cash && equity);

  const years = await request(app).get("/api/v1/fiscal-years").set("Authorization", `Bearer ${token}`);
  const postingDate = years.body.data[0].periods[0].startDate as string;
  const draft = {
    entryDate: postingDate,
    description: "Opening cash",
    sourceType: "opening_balance",
    lines: [
      { accountId: cash.id, debit: "100.00", credit: "0.00", description: "Cash" },
      { accountId: equity.id, debit: "0.00", credit: "100.00", description: "Equity" },
    ],
  };
  const created = await request(app).post("/api/v1/journals").set("Authorization", `Bearer ${token}`).send(draft);
  assert.equal(created.status, 201);
  const id = created.body.id as string;

  const beforePost = await request(app)
    .get(`/api/v1/reports/trial-balance?asOf=${postingDate}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(beforePost.status, 200);
  assert.equal(beforePost.body.rows.length, 0);

  assert.equal((await request(app).post(`/api/v1/journals/${id}/submit`).set("Authorization", `Bearer ${token}`)).status, 200);
  assert.equal((await request(app).post(`/api/v1/journals/${id}/approve`).set("Authorization", `Bearer ${token}`)).status, 200);
  const posted = await request(app)
    .post(`/api/v1/journals/${id}/post`)
    .set("Authorization", `Bearer ${token}`)
    .send({ postingDate });
  assert.equal(posted.status, 200);
  assert.equal(posted.body.status, "posted");
  assert.equal(posted.body.postingDate, postingDate);
  assert.equal(posted.body.entryDate, postingDate);

  const edited = await request(app).put(`/api/v1/journals/${id}`).set("Authorization", `Bearer ${token}`).send(draft);
  assert.equal(edited.status, 409);

  const { query } = await import("../../src/db/pool");
  await assert.rejects(query("UPDATE journal_entries SET description = $2 WHERE id = $1", [id, "silent edit"]));

  const trial = await request(app)
    .get(`/api/v1/reports/trial-balance?asOf=${postingDate}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(trial.body.balances, true);
  assert.equal(trial.body.totalDebit, trial.body.totalCredit);
  assert.equal(trial.body.totalDebit, "100.0000");

  const sheet = await request(app)
    .get(`/api/v1/reports/balance-sheet?asOf=${postingDate}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(sheet.body.balances, true);
  assert.equal(sheet.body.totalAssets, "100.0000");

  const reversed = await request(app)
    .post(`/api/v1/journals/${id}/reverse`)
    .set("Authorization", `Bearer ${token}`)
    .send({ postingDate, reason: "Posted to the wrong account" });
  assert.equal(reversed.status, 200);
  assert.equal(reversed.body.sourceType, "reversal");
  assert.equal(reversed.body.status, "posted");

  const after = await request(app)
    .get(`/api/v1/reports/trial-balance?asOf=${postingDate}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(after.body.balances, true);
  assert.equal(after.body.totalDebit, "0.0000");
});

test("sales invoices, partial returns, and receipts stay within the receivable control account", async () => {
  const auth = { Authorization: `Bearer ${token}` };
  const accounts = await request(app).get("/api/v1/accounts?postable=true&pageSize=100").set(auth);
  const byCode = (code: string) => accounts.body.data.find((row: { code: string }) => row.code === code);
  const sales = byCode("4100");
  const tax = byCode("2200");
  const receivable = byCode("1200");
  const cash = byCode("1110");
  assert.ok(sales && tax && receivable && cash);
  const years = await request(app).get("/api/v1/fiscal-years").set(auth);
  const postingDate = years.body.data[0].periods[0].startDate as string;
  const branches = await request(app).get("/api/v1/branches?pageSize=10").set(auth);
  const branchId = branches.body.data[0].id as string;

  const blocked = await request(app).post("/api/v1/journals").set(auth).send({
    entryDate: postingDate,
    description: "Manual receivable",
    sourceType: "manual",
    lines: [
      { accountId: receivable.id, debit: "5.00", credit: "0.00" },
      { accountId: cash.id, debit: "0.00", credit: "5.00" },
    ],
  });
  assert.equal(blocked.status, 409);

  const taxCode = await request(app).post("/api/v1/tax-codes").set(auth).send({
    code: "VAT10", name: "VAT 10", ratePercent: "10", salesAccountId: tax.id, effectiveFrom: postingDate,
  });
  assert.equal(taxCode.status, 201);
  const customer = await request(app).post("/api/v1/customers").set(auth).send({
    code: "C001", legalName: "Northwind", displayName: "Northwind", paymentTermsDays: 30,
    creditLimit: "1000.00", isActive: true, addresses: [], contacts: [],
  });
  assert.equal(customer.status, 201);
  const product = await request(app).post("/api/v1/products").set(auth).send({
    sku: "SVC-1", name: "Service", itemType: "service", salesPrice: "10.00", taxCodeId: taxCode.body.id,
    salesAccountId: sales.id, returnAccountId: sales.id, isActive: true, units: [],
  });
  assert.equal(product.status, 201);

  const invoice = await request(app).post("/api/v1/invoices").set(auth).send({
    customerId: customer.body.id, branchId, invoiceDate: postingDate,
    lines: [{ productId: product.body.id, quantity: "3", unitPrice: "10.00", taxCodeId: taxCode.body.id }],
  });
  assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
  assert.equal(invoice.body.total, "33.0000");
  const invoiceId = invoice.body.id as string;
  const lineId = invoice.body.lines[0].id as string;
  assert.equal((await request(app).post(`/api/v1/invoices/${invoiceId}/submit`).set(auth)).status, 200);
  assert.equal((await request(app).post(`/api/v1/invoices/${invoiceId}/approve`).set(auth)).status, 200);
  const posted = await request(app).post(`/api/v1/invoices/${invoiceId}/post`).set(auth).send({});
  assert.equal(posted.status, 200, JSON.stringify(posted.body));

  const earlyReceipt = await request(app).post("/api/v1/receipts").set(auth).send({
    customerId: customer.body.id, branchId, receiptDate: postingDate, cashAccountId: cash.id, amount: "10.00", allocations: [],
  });
  assert.equal(earlyReceipt.status, 409);

  const partial = await request(app).post("/api/v1/customer-returns").set(auth).send({
    customerId: customer.body.id, branchId, returnDate: postingDate, reason: "Partial", unreferenced: false,
    lines: [{ invoiceLineId: lineId, quantity: "1", disposition: "restockable" }],
  });
  assert.equal(partial.status, 201, JSON.stringify(partial.body));
  assert.equal(partial.body.total, "11.0000");
  const returnId = partial.body.id as string;
  assert.equal((await request(app).post(`/api/v1/customer-returns/${returnId}/submit`).set(auth)).status, 200);
  assert.equal((await request(app).post(`/api/v1/customer-returns/${returnId}/approve`).set(auth)).status, 200);
  assert.equal((await request(app).post(`/api/v1/customer-returns/${returnId}/post`).set(auth)).status, 200);

  const tooMuch = await request(app).post("/api/v1/customer-returns").set(auth).send({
    customerId: customer.body.id, branchId, returnDate: postingDate, reason: "Too much", unreferenced: false,
    lines: [{ invoiceLineId: lineId, quantity: "3", disposition: "damaged" }],
  });
  assert.equal(tooMuch.status, 409);

  const blockedReverse = await request(app).post(`/api/v1/invoices/${invoiceId}/reverse`).set(auth).send({ reason: "Too soon" });
  assert.equal(blockedReverse.status, 409);

  const aging = await request(app).get(`/api/v1/reports/receivables-aging?asOf=${postingDate}`).set(auth);
  assert.equal(aging.status, 200, JSON.stringify(aging.body));
  assert.equal(aging.body.totals.open, "22.0000");

  const advances = await request(app).post("/api/v1/accounts").set(auth).send({
    code: "2300", name: "Customer advances", accountType: "liability", isHeader: false, isControl: false, isActive: true,
  });
  assert.equal(advances.status, 201, JSON.stringify(advances.body));
  const settings = await request(app).put("/api/v1/sales-settings").set(auth).send({
    taxPricingMode: "exclusive", unappliedReceiptTreatment: "customer_advance",
    arControlAccountId: receivable.id, customerAdvanceAccountId: advances.body.id,
    showCustomerTaxIdentifiers: false,
  });
  assert.equal(settings.status, 200, JSON.stringify(settings.body));

  const receipt = await request(app).post("/api/v1/receipts").set(auth).send({
    customerId: customer.body.id, branchId, receiptDate: postingDate, cashAccountId: cash.id, amount: "22.00", allocations: [],
  });
  assert.equal(receipt.status, 201, JSON.stringify(receipt.body));
  const receiptId = receipt.body.id as string;
  assert.equal((await request(app).post(`/api/v1/receipts/${receiptId}/submit`).set(auth)).status, 200);
  assert.equal((await request(app).post(`/api/v1/receipts/${receiptId}/approve`).set(auth)).status, 200);
  assert.equal((await request(app).post(`/api/v1/receipts/${receiptId}/post`).set(auth)).status, 200);
  const allocated = await request(app).post(`/api/v1/receipts/${receiptId}/allocations`).set(auth).send({ invoiceId, amount: "22.00" });
  assert.equal(allocated.status, 200, JSON.stringify(allocated.body));
  const stillBlocked = await request(app).post(`/api/v1/invoices/${invoiceId}/reverse`).set(auth).send({ reason: "Still allocated" });
  assert.equal(stillBlocked.status, 409);
  const closed = await request(app).get(`/api/v1/reports/receivables-aging?asOf=${postingDate}`).set(auth);
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.totals.open, "0.0000");
});

test("supplier bills, partial returns, and payments stay within the payable control account", async () => {
  const auth = { Authorization: `Bearer ${token}` };
  const accounts = await request(app).get("/api/v1/accounts?postable=true&pageSize=100").set(auth);
  const byCode = (code: string) => accounts.body.data.find((row: { code: string }) => row.code === code);
  const payable = byCode("2100");
  const expense = byCode("5100");
  const sales = byCode("4100");
  const cash = byCode("1110");
  assert.ok(payable && expense && sales && cash);
  const years = await request(app).get("/api/v1/fiscal-years").set(auth);
  const postingDate = years.body.data[0].periods[0].startDate as string;
  const branches = await request(app).get("/api/v1/branches?pageSize=10").set(auth);
  const branchId = branches.body.data[0].id as string;

  const manualPayable = await request(app).post("/api/v1/journals").set(auth).send({
    entryDate: postingDate,
    description: "Manual payable",
    sourceType: "manual",
    lines: [
      { accountId: expense.id, debit: "5.00", credit: "0.00" },
      { accountId: payable.id, debit: "0.00", credit: "5.00" },
    ],
  });
  assert.equal(manualPayable.status, 409);

  const inputTax = await request(app).post("/api/v1/accounts").set(auth).send({
    code: "1410", name: "Input tax", accountType: "asset", isHeader: false, isControl: false, isActive: true,
  });
  assert.equal(inputTax.status, 201, JSON.stringify(inputTax.body));
  const taxCode = await request(app).post("/api/v1/tax-codes").set(auth).send({
    code: "IN10", name: "Input 10", ratePercent: "10", purchaseAccountId: inputTax.body.id, effectiveFrom: postingDate,
  });
  assert.equal(taxCode.status, 201, JSON.stringify(taxCode.body));
  const supplier = await request(app).post("/api/v1/suppliers").set(auth).send({
    code: "S001", legalName: "Harbor Paper", displayName: "Harbor Paper", paymentTermsDays: 30,
    isActive: true, addresses: [], contacts: [],
  });
  assert.equal(supplier.status, 201, JSON.stringify(supplier.body));
  const bare = await request(app).post("/api/v1/products").set(auth).send({
    sku: "BUY-BARE", name: "Unmapped purchase", itemType: "service", salesPrice: "10.00",
    salesAccountId: sales.id, returnAccountId: sales.id, isActive: true, units: [],
  });
  assert.equal(bare.status, 201, JSON.stringify(bare.body));
  const missingAccount = await request(app).post("/api/v1/bills").set(auth).send({
    supplierId: supplier.body.id, branchId, billDate: postingDate,
    lines: [{ productId: bare.body.id, quantity: "1", unitPrice: "10.00" }],
  });
  assert.equal(missingAccount.status, 400);

  const product = await request(app).post("/api/v1/products").set(auth).send({
    sku: "BUY-1", name: "Purchased service", itemType: "service", salesPrice: "10.00", taxCodeId: taxCode.body.id,
    salesAccountId: sales.id, returnAccountId: sales.id, purchaseAccountId: expense.id, isActive: true, units: [],
  });
  assert.equal(product.status, 201, JSON.stringify(product.body));
  const bill = await request(app).post("/api/v1/bills").set(auth).send({
    supplierId: supplier.body.id, branchId, billDate: postingDate,
    lines: [{ productId: product.body.id, quantity: "3", unitPrice: "10.00", taxCodeId: taxCode.body.id }],
  });
  assert.equal(bill.status, 201, JSON.stringify(bill.body));
  assert.equal(bill.body.total, "33.0000");
  const billId = bill.body.id as string;
  const lineId = bill.body.lines[0].id as string;
  assert.equal((await request(app).post(`/api/v1/bills/${billId}/submit`).set(auth)).status, 200);
  assert.equal((await request(app).post(`/api/v1/bills/${billId}/approve`).set(auth)).status, 200);
  const posted = await request(app).post(`/api/v1/bills/${billId}/post`).set(auth).send({});
  assert.equal(posted.status, 200, JSON.stringify(posted.body));

  const partial = await request(app).post("/api/v1/supplier-returns").set(auth).send({
    supplierId: supplier.body.id, branchId, returnDate: postingDate, reason: "Partial", unreferenced: false,
    lines: [{ billLineId: lineId, quantity: "1", disposition: "restockable" }],
  });
  assert.equal(partial.status, 201, JSON.stringify(partial.body));
  assert.equal(partial.body.total, "11.0000");
  const returnId = partial.body.id as string;
  assert.equal((await request(app).post(`/api/v1/supplier-returns/${returnId}/submit`).set(auth)).status, 200);
  assert.equal((await request(app).post(`/api/v1/supplier-returns/${returnId}/approve`).set(auth)).status, 200);
  assert.equal((await request(app).post(`/api/v1/supplier-returns/${returnId}/post`).set(auth)).status, 200);

  const tooMuch = await request(app).post("/api/v1/supplier-returns").set(auth).send({
    supplierId: supplier.body.id, branchId, returnDate: postingDate, reason: "Too much", unreferenced: false,
    lines: [{ billLineId: lineId, quantity: "3", disposition: "damaged" }],
  });
  assert.equal(tooMuch.status, 409);
  const blockedReverse = await request(app).post(`/api/v1/bills/${billId}/reverse`).set(auth).send({ reason: "Too soon" });
  assert.equal(blockedReverse.status, 409);

  const direct = await request(app).post("/api/v1/supplier-payments").set(auth).send({
    supplierId: supplier.body.id, branchId, paymentDate: postingDate, cashAccountId: cash.id, amount: "10.00",
    allocations: [{ billId, amount: "10.00" }],
  });
  assert.equal(direct.status, 201, JSON.stringify(direct.body));
  const directId = direct.body.id as string;
  assert.equal((await request(app).post(`/api/v1/supplier-payments/${directId}/submit`).set(auth)).status, 200);
  assert.equal((await request(app).post(`/api/v1/supplier-payments/${directId}/approve`).set(auth)).status, 200);
  const directPosted = await request(app).post(`/api/v1/supplier-payments/${directId}/post`).set(auth);
  assert.equal(directPosted.status, 200, JSON.stringify(directPosted.body));
  assert.equal(directPosted.body.apTreatment, "direct_ap");

  const earlyAdvance = await request(app).post("/api/v1/supplier-payments").set(auth).send({
    supplierId: supplier.body.id, branchId, paymentDate: postingDate, cashAccountId: cash.id, amount: "5.00", allocations: [],
  });
  assert.equal(earlyAdvance.status, 201, JSON.stringify(earlyAdvance.body));
  const advancePaymentId = earlyAdvance.body.id as string;
  assert.equal((await request(app).post(`/api/v1/supplier-payments/${advancePaymentId}/submit`).set(auth)).status, 200);
  assert.equal((await request(app).post(`/api/v1/supplier-payments/${advancePaymentId}/approve`).set(auth)).status, 200);
  const blockedAdvance = await request(app).post(`/api/v1/supplier-payments/${advancePaymentId}/post`).set(auth);
  assert.equal(blockedAdvance.status, 409);
  assert.match(String(blockedAdvance.body.error?.message ?? ""), /supplier advance asset account/i);

  const advances = await request(app).post("/api/v1/accounts").set(auth).send({
    code: "1510", name: "Supplier advances", accountType: "asset", isHeader: false, isControl: false, isActive: true,
  });
  assert.equal(advances.status, 201, JSON.stringify(advances.body));
  const currentSettings = await request(app).get("/api/v1/purchasing-settings").set(auth);
  assert.equal(currentSettings.status, 200, JSON.stringify(currentSettings.body));
  const settings = await request(app).put("/api/v1/purchasing-settings").set(auth).send({
    taxPricingMode: "exclusive",
    apControlAccountId: currentSettings.body.apControlAccountId,
    supplierAdvanceAccountId: advances.body.id,
    showSupplierTaxIdentifiers: false,
  });
  assert.equal(settings.status, 200, JSON.stringify(settings.body));
  const advancePosted = await request(app).post(`/api/v1/supplier-payments/${advancePaymentId}/post`).set(auth);
  assert.equal(advancePosted.status, 200, JSON.stringify(advancePosted.body));
  assert.equal(advancePosted.body.apTreatment, "supplier_advance");

  const beforeApply = await request(app).get(`/api/v1/reports/payables-aging?asOf=${postingDate}`).set(auth);
  assert.equal(beforeApply.status, 200, JSON.stringify(beforeApply.body));
  assert.equal(beforeApply.body.totals.open, "12.0000");

  const applied = await request(app).post(`/api/v1/supplier-payments/${advancePaymentId}/allocations`).set(auth).send({ billId, amount: "5.00" });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const aging = await request(app).get(`/api/v1/reports/payables-aging?asOf=${postingDate}`).set(auth);
  assert.equal(aging.status, 200, JSON.stringify(aging.body));
  assert.equal(aging.body.totals.open, "7.0000");
  const statement = await request(app).get(`/api/v1/reports/supplier-statement?supplierId=${supplier.body.id}&from=${postingDate}&to=${postingDate}`).set(auth);
  assert.equal(statement.status, 200, JSON.stringify(statement.body));
  assert.equal(statement.body.closingBalance, "7.0000");
  const purchases = await request(app).get(`/api/v1/reports/purchases?from=${postingDate}&to=${postingDate}`).set(auth);
  assert.equal(purchases.status, 200, JSON.stringify(purchases.body));
  assert.equal(purchases.body.total, "22.0000");
  const returns = await request(app).get(`/api/v1/reports/supplier-returns?from=${postingDate}&to=${postingDate}`).set(auth);
  assert.equal(returns.status, 200, JSON.stringify(returns.body));
  assert.equal(returns.body.total, "11.0000");
  const trial = await request(app).get(`/api/v1/reports/trial-balance?asOf=${postingDate}`).set(auth);
  assert.equal(trial.body.balances, true);
  assert.equal(trial.body.totalDebit, trial.body.totalCredit);
});

const SALES_MANAGER_PERMISSIONS = [
  "accounting_profile.update",
  "accounting_profile.view",
  "accounts.create",
  "accounts.update",
  "accounts.view",
  "audit.view",
  "bills.approve",
  "bills.create",
  "bills.override_due_date",
  "bills.post",
  "bills.reverse",
  "bills.submit",
  "bills.update",
  "bills.view",
  "bills.void",
  "branches.create",
  "branches.update",
  "branches.view",
  "company.update",
  "company.view",
  "customer_returns.approve",
  "customer_returns.create",
  "customer_returns.create_unreferenced",
  "customer_returns.post",
  "customer_returns.reverse",
  "customer_returns.submit",
  "customer_returns.update",
  "customer_returns.view",
  "customer_returns.void",
  "customers.create",
  "customers.update",
  "customers.view",
  "invoices.approve",
  "invoices.create",
  "invoices.override_credit_limit",
  "invoices.override_due_date",
  "invoices.post",
  "invoices.reverse",
  "invoices.submit",
  "invoices.update",
  "invoices.view",
  "invoices.void",
  "journals.approve",
  "journals.create",
  "journals.post",
  "journals.reverse",
  "journals.submit",
  "journals.update",
  "users.create",
  "users.update",
];

test("an administrator can save the sales manager role without dropping permissions", async () => {
  const auth = { Authorization: `Bearer ${token}` };
  const created = await request(app).post("/api/v1/roles").set(auth).send({
    code: "SmgrSale",
    name: "Manager Sales",
    permissions: SALES_MANAGER_PERMISSIONS,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.deepEqual([...created.body.permissions].sort(), [...SALES_MANAGER_PERMISSIONS].sort());

  const listed = await request(app).get("/api/v1/roles").set(auth);
  assert.equal(listed.status, 200);
  const saved = listed.body.data.find((role: { code: string }) => role.code === "SmgrSale");
  assert.ok(saved);
  assert.equal(saved.name, "Manager Sales");
  assert.deepEqual([...saved.permissions].sort(), [...SALES_MANAGER_PERMISSIONS].sort());

  const badCode = await request(app).post("/api/v1/roles").set(auth).send({
    code: "Bad Code",
    name: "Bad",
    permissions: [],
  });
  assert.equal(badCode.status, 400);
  assert.match(String(badCode.body.error?.details?.fieldErrors?.code?.[0] ?? ""), /letters, digits, and underscores/);

  const unknown = await request(app).post("/api/v1/roles").set(auth).send({
    code: "bad_perm",
    name: "Bad permission",
    permissions: ["not.a.permission"],
  });
  assert.equal(unknown.status, 400, JSON.stringify(unknown.body));
  assert.match(JSON.stringify(unknown.body), /not\.a\.permission/);

  const limited = await request(app).post("/api/v1/roles").set(auth).send({
    code: "role_clerk",
    name: "Role clerk",
    permissions: ["roles.create", "roles.view"],
  });
  assert.equal(limited.status, 201, JSON.stringify(limited.body));
  const user = await request(app).post("/api/v1/users").set(auth).send({
    email: "role.clerk@example.com",
    displayName: "Role clerk",
    isActive: true,
    password: "Limited-User-1",
    roleIds: [limited.body.id],
    branchIds: [],
  });
  assert.equal(user.status, 201, JSON.stringify(user.body));
  const login = await request(app).post("/api/v1/auth/login").send({
    email: "role.clerk@example.com",
    password: "Limited-User-1",
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const changed = await request(app)
    .post("/api/v1/auth/change-password")
    .set("Authorization", `Bearer ${login.body.token}`)
    .send({ currentPassword: "Limited-User-1", newPassword: "Limited-User-2" });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const denied = await request(app)
    .post("/api/v1/roles")
    .set("Authorization", `Bearer ${changed.body.token}`)
    .send({ code: "too_wide", name: "Too wide", permissions: ["roles.create", "journals.post"] });
  assert.equal(denied.status, 403, JSON.stringify(denied.body));
  assert.match(String(denied.body.error?.message ?? ""), /journals\.post/);
  const afterDeny = await request(app).get("/api/v1/roles").set(auth);
  assert.equal(afterDeny.body.data.some((role: { code: string }) => role.code === "too_wide"), false);
});
