import { query } from "../../db/pool";
import { withTransaction } from "../../db/transaction";
import { writeAudit } from "../../shared/audit";
import { buildMonthlyPeriods, fiscalYearName } from "../../shared/dates";
import { AppError, one } from "../../shared/errors";
import type { RequestMeta } from "../auth/auth.types";
import { selectFiscalStartMonth } from "../company/company.repository";
import {
  closeYearPeriods,
  countUnpostedInPeriod,
  insertPeriod,
  insertYear,
  listPeriods,
  listYears,
  lockPeriod,
  lockYear,
  setPeriodStatus,
  setYearStatus,
} from "./periods.repository";

export async function listFiscalYears() {
  const years = await listYears({ query });
  const periods = await listPeriods({ query });
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
  const company = one((await selectFiscalStartMonth({ query })).rows);
  if (Number(startDate.slice(5, 7)) !== company.fiscal_year_start_month) {
    throw new AppError(400, "VALIDATION", "The fiscal year must start in the month configured on the company profile.");
  }
  const built = buildMonthlyPeriods(startDate);
  return withTransaction(async (client) => {
    const year = one((await insertYear(client, fiscalYearName(startDate, built.endDate), startDate, built.endDate)).rows) as {
      id: string;
      name: string;
      start_date: string;
      end_date: string;
      status: string;
    };
    for (const period of built.periods) {
      await insertPeriod(client, year.id, period);
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
    const period = one((await lockPeriod(client, id)).rows, "Period not found.") as {
      id: string;
      status: string;
      name: string;
      year_id: string;
      year_status: string;
    };
    if (status === "open" && period.year_status !== "open") {
      throw new AppError(409, "YEAR_CLOSED", "Reopen the fiscal year before reopening a period.");
    }
    if (period.status === status) {
      throw new AppError(409, "PERIOD_STATE", `The period is already ${status}.`);
    }
    await setPeriodStatus(client, id, status);
    const drafts = await countUnpostedInPeriod(client, id);
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
    const year = one((await lockYear(client, id)).rows, "Fiscal year not found.") as { id: string; name: string; status: string };
    if (year.status === status) throw new AppError(409, "YEAR_STATE", `The fiscal year is already ${status}.`);
    await setYearStatus(client, id, status);
    if (status === "closed") await closeYearPeriods(client, id);
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
