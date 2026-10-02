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
