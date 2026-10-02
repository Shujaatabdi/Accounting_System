import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMonths, buildMonthlyPeriods, currentFiscalStart, formatDateInTimeZone } from "../../src/shared/dates";

describe("dates", () => {
  it("clamps month ends", () => {
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  });

  it("builds a year that starts in April", () => {
    const year = buildMonthlyPeriods("2026-04-01");
    assert.equal(year.periods[0].startDate, "2026-04-01");
    assert.equal(year.periods[0].endDate, "2026-04-30");
    assert.equal(year.periods[1].endDate, "2026-05-31");
    assert.equal(year.periods[11].startDate, "2027-03-01");
    assert.equal(year.endDate, "2027-03-31");
  });

  it("covers a leap-year February", () => {
    const year = buildMonthlyPeriods("2024-01-01");
    assert.equal(year.periods[1].endDate, "2024-02-29");
  });

  it("chooses the fiscal start from the company month", () => {
    assert.equal(currentFiscalStart("2026-10-01", 1), "2026-01-01");
    assert.equal(currentFiscalStart("2026-02-01", 4), "2025-04-01");
  });

  it("formats a calendar date in a time zone", () => {
    const instant = new Date("2026-01-01T00:30:00Z");
    assert.equal(formatDateInTimeZone(instant, "UTC"), "2026-01-01");
    assert.equal(formatDateInTimeZone(instant, "America/New_York"), "2025-12-31");
  });
});
