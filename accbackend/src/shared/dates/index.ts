import { AppError } from "../errors";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertIsoDate(value: string): void {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new AppError(400, "VALIDATION", "Dates must use YYYY-MM-DD.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new AppError(400, "VALIDATION", "Dates must be real calendar dates.");
  }
}

export function addDays(isoDate: string, days: number): string {
  assertIsoDate(isoDate);
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function addMonths(isoDate: string, months: number): string {
  assertIsoDate(isoDate);
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), clamped)).toISOString().slice(0, 10);
}

export type PeriodDraft = {
  periodNo: number;
  name: string;
  startDate: string;
  endDate: string;
};

export function buildMonthlyPeriods(startDate: string): { endDate: string; periods: PeriodDraft[] } {
  assertIsoDate(startDate);
  if (!startDate.endsWith("-01")) {
    throw new AppError(400, "VALIDATION", "A fiscal year must start on the first day of a month.");
  }
  const periods: PeriodDraft[] = [];
  let cursor = startDate;
  for (let periodNo = 1; periodNo <= 12; periodNo += 1) {
    const next = addMonths(cursor, 1);
    const endDate = addDays(next, -1);
    periods.push({ periodNo, name: cursor.slice(0, 7), startDate: cursor, endDate });
    cursor = next;
  }
  return { endDate: addDays(cursor, -1), periods };
}

export function fiscalYearName(startDate: string, endDate: string): string {
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  return startYear === endYear ? `FY ${startYear}` : `FY ${startYear}-${endYear}`;
}

export function currentFiscalStart(today: string, startMonth: number): string {
  assertIsoDate(today);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const fiscalYear = month >= startMonth ? year : year - 1;
  return `${String(fiscalYear).padStart(4, "0")}-${String(startMonth).padStart(2, "0")}-01`;
}

export function assertTimeZone(timeZone: string): void {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new AppError(400, "VALIDATION", "Time zone must be a valid IANA name, such as Asia/Karachi.");
  }
}

export function formatDateInTimeZone(date: Date, timeZone: string): string {
  assertTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) {
    throw new AppError(500, "DATE_FORMAT", "Could not format the company date.");
  }
  return `${year}-${month}-${day}`;
}

export function todayInTimeZone(timeZone: string): string {
  return formatDateInTimeZone(new Date(), timeZone);
}
