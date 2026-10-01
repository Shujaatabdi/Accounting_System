import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import EmbeddedPostgres from "embedded-postgres";
import request from "supertest";
import type { Express } from "express";

const port = 54329;
const databaseDir = path.join(os.tmpdir(), `acc-foundation-${process.pid}`);
let postgres: EmbeddedPostgres;
let app: Express;
let token = "";

before(async () => {
  fs.rmSync(databaseDir, { recursive: true, force: true });
  postgres = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
  });
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
});

after(async () => {
  const { closePool } = await import("../../src/db/pool");
  await closePool();
  await postgres.stop();
  fs.rmSync(databaseDir, { recursive: true, force: true });
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
