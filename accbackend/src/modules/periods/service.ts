import { query, withTransaction } from "../../db/pool";
import { writeAudit } from "../../lib/audit";
import { buildMonthlyPeriods, fiscalYearName } from "../../lib/dates";
import { AppError, one } from "../../lib/errors";
import type { RequestMeta } from "../auth/types";

export async function listFiscalYears() {
  const years = await query(
    `SELECT id, name, start_date, end_date, status FROM fiscal_years ORDER BY start_date`,
  );
  const periods = await query(
    `SELECT id, fiscal_year_id, period_no, name, start_date, end_date, status
       FROM fiscal_periods ORDER BY start_date`,
  );
  return years.rows.map((year) => ({
    id: year.id as string,
    name: year.name as string,
    startDate: year.start_date as string,
    endDate: year.end_date as string,
    status: year.status as string,
    periods: periods.rows
      .filter((period) => period.fiscal_year_id === year.id)
      .map((period) => ({
        id: period.id as string,
        periodNo: period.period_no as number,
        name: period.name as string,
        startDate: period.start_date as string,
        endDate: period.end_date as string,
        status: period.status as string,
      })),
  }));
}

export async function createFiscalYear(startDate: string, meta: RequestMeta) {
  const company = one(
    (await query<{ fiscal_year_start_month: number }>("SELECT fiscal_year_start_month FROM company WHERE id = 1")).rows,
  );
  if (Number(startDate.slice(5, 7)) !== company.fiscal_year_start_month) {
    throw new AppError(
      400,
      "VALIDATION",
      "The fiscal year must start in the month configured on the company profile.",
    );
  }
  const built = buildMonthlyPeriods(startDate);
  return withTransaction(async (client) => {
    const year = one(
      (
        await client.query(
          `INSERT INTO fiscal_years (name, start_date, end_date, status)
           VALUES ($1, $2, $3, 'open') RETURNING id, name, start_date, end_date, status`,
          [fiscalYearName(startDate, built.endDate), startDate, built.endDate],
        )
      ).rows,
    ) as { id: string; name: string; start_date: string; end_date: string; status: string };
    for (const period of built.periods) {
      await client.query(
        `INSERT INTO fiscal_periods (fiscal_year_id, period_no, name, start_date, end_date, status)
         VALUES ($1,$2,$3,$4,$5,'open')`,
        [year.id, period.periodNo, period.name, period.startDate, period.endDate],
      );
    }
    await writeAudit(client, {
      actorUserId: meta.actor.id,
      action: "periods.create",
      entityType: "fiscal_year",
      entityId: year.id,
      summary: `Created ${year.name}`,
      after: { name: year.name, startDate: year.start_date, endDate: year.end_date },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
    });
    return { id: year.id };
  });
}

export async function closePeriod(id: string, reason: string, meta: RequestMeta) {
  return changePeriod(id, "closed", "periods.close", reason, meta);
}

export async function reopenPeriod(id: string, reason: string, meta: RequestMeta) {
  return changePeriod(id, "open", "periods.reopen", reason, meta);
}

async function changePeriod(id: string, status: "open" | "closed", action: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const period = one(
      (
        await client.query(
          `SELECT p.id, p.status, p.name, y.id AS year_id, y.status AS year_status
             FROM fiscal_periods p
             JOIN fiscal_years y ON y.id = p.fiscal_year_id
            WHERE p.id = $1
            FOR UPDATE OF p, y`,
          [id],
        )
      ).rows,
      "Period not found.",
    ) as { id: string; status: string; name: string; year_id: string; year_status: string };
    if (status === "open" && period.year_status !== "open") {
      throw new AppError(409, "YEAR_CLOSED", "Reopen the fiscal year before reopening a period.");
    }
    if (period.status === status) {
      throw new AppError(409, "PERIOD_STATE", `The period is already ${status}.`);
    }
    await client.query("UPDATE fiscal_periods SET status = $2 WHERE id = $1", [id, status]);
    const drafts = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM journal_entries je
         JOIN fiscal_periods p ON je.entry_date BETWEEN p.start_date AND p.end_date
        WHERE p.id = $1 AND je.status IN ('draft', 'pending_approval', 'approved')`,
      [id],
    );
    await writeAudit(client, {
      actorUserId: meta.actor.id,
      action,
      entityType: "fiscal_period",
      entityId: id,
      summary: `${status === "closed" ? "Closed" : "Reopened"} period ${period.name}`,
      before: { status: period.status },
      after: { status, reason, unpostedDocuments: Number(drafts.rows[0].count) },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
    });
    return { id, status, unpostedDocuments: Number(drafts.rows[0].count) };
  });
}

export async function closeYear(id: string, reason: string, meta: RequestMeta) {
  return changeYear(id, "closed", "periods.close", reason, meta);
}

export async function reopenYear(id: string, reason: string, meta: RequestMeta) {
  return changeYear(id, "open", "periods.reopen", reason, meta);
}

async function changeYear(id: string, status: "open" | "closed", action: string, reason: string, meta: RequestMeta) {
  return withTransaction(async (client) => {
    const year = one(
      (await client.query("SELECT id, name, status FROM fiscal_years WHERE id = $1 FOR UPDATE", [id])).rows,
      "Fiscal year not found.",
    ) as { id: string; name: string; status: string };
    if (year.status === status) throw new AppError(409, "YEAR_STATE", `The fiscal year is already ${status}.`);
    await client.query("UPDATE fiscal_years SET status = $2 WHERE id = $1", [id, status]);
    if (status === "closed") {
      await client.query("UPDATE fiscal_periods SET status = 'closed' WHERE fiscal_year_id = $1", [id]);
    }
    await writeAudit(client, {
      actorUserId: meta.actor.id,
      action,
      entityType: "fiscal_year",
      entityId: id,
      summary: `${status === "closed" ? "Closed" : "Reopened"} ${year.name}`,
      before: { status: year.status },
      after: { status, reason, periodsReopened: false },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
    });
    return { id, status };
  });
}
