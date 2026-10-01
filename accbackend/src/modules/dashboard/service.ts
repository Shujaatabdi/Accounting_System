import { query } from "../../db/pool";
import { todayInTimeZone } from "../../lib/dates";
import type { AuthUser } from "../auth/types";
import { getCompany } from "../company/service";
import { trialBalance } from "../reports/service";

export async function getDashboard(actor: AuthUser) {
  const company = await getCompany();
  const can = (code: string) => actor.isCompanyAdmin || actor.permissions.includes(code);
  const body: Record<string, unknown> = {
    company: {
      displayName: company.displayName,
      legalName: company.legalName,
      currencyName: company.currencyName,
      currencySymbol: company.currencySymbol,
      currencyDecimalPlaces: company.currencyDecimalPlaces,
      countryCode: company.countryCode,
      timezone: company.timezone,
      profilePlaceholder: company.profilePlaceholder,
    },
  };
  if (can("journals.view")) {
    const drafts = await query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM journal_entries WHERE status IN ('draft', 'pending_approval', 'approved')",
    );
    body.unpostedJournals = Number(drafts.rows[0].count);
  }
  if (can("periods.view")) {
    const periods = await query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM fiscal_periods WHERE status = 'open'",
    );
    body.openPeriods = Number(periods.rows[0].count);
  }
  if (can("reports.view")) {
    body.trialBalance = await trialBalance(actor, { asOf: todayInTimeZone(company.timezone) });
  }
  return body;
}
