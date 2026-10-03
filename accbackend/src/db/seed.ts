import "dotenv/config";
import { getConfig } from "../config/env";
import { closePool } from "./pool";
import { withTransaction } from "./transaction";
import { buildMonthlyPeriods, currentFiscalStart, fiscalYearName, todayInTimeZone } from "../shared/dates";
import { COMPANY_ADMIN_ROLE, PERMISSIONS } from "../modules/auth/auth.permissions";
import { assertPassword, hashPassword } from "../modules/auth/auth.passwords";

type StarterAccount = {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  header: boolean;
  parent?: string;
  subtype?: string;
  control?: boolean;
  system?: boolean;
};

const STARTER_ACCOUNTS: StarterAccount[] = [
  { code: "1000", name: "Assets", type: "asset", header: true },
  { code: "1100", name: "Cash and bank", type: "asset", header: true, parent: "1000" },
  { code: "1110", name: "Cash on hand", type: "asset", header: false, parent: "1100", subtype: "cash" },
  { code: "1120", name: "Bank", type: "asset", header: false, parent: "1100", subtype: "bank" },
  { code: "1200", name: "Accounts receivable", type: "asset", header: false, parent: "1000", subtype: "receivable", control: true, system: true },
  { code: "2000", name: "Liabilities", type: "liability", header: true },
  { code: "2100", name: "Accounts payable", type: "liability", header: false, parent: "2000", subtype: "payable", control: true, system: true },
  { code: "2200", name: "Tax payable", type: "liability", header: false, parent: "2000", subtype: "tax" },
  { code: "3000", name: "Equity", type: "equity", header: true },
  { code: "3100", name: "Owner equity", type: "equity", header: false, parent: "3000", subtype: "equity" },
  { code: "3200", name: "Retained earnings", type: "equity", header: false, parent: "3000", subtype: "retained_earnings", system: true },
  { code: "4000", name: "Income", type: "income", header: true },
  { code: "4100", name: "Sales", type: "income", header: false, parent: "4000", subtype: "income" },
  { code: "5000", name: "Expenses", type: "expense", header: true },
  { code: "5100", name: "Operating expenses", type: "expense", header: false, parent: "5000", subtype: "expense" },
];

export async function seed(): Promise<void> {
  const config = getConfig();
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO company (
         id, legal_name, display_name, country_code, timezone, currency_name, currency_symbol
       ) VALUES (1, 'Company name not set', 'Company name not set', 'ZZ', 'UTC', 'Currency', '¤')
       ON CONFLICT (id) DO NOTHING`,
    );
    await client.query(
      `INSERT INTO branches (code, name, country_code)
       SELECT 'MAIN', 'Main', 'ZZ'
        WHERE NOT EXISTS (SELECT 1 FROM branches)`,
    );
    await client.query(
      `INSERT INTO document_sequences (doc_type, prefix, next_number, pad_length)
       VALUES ('journal', 'JE-', 1, 5),
              ('invoice', 'INV-', 1, 5),
              ('receipt', 'RCT-', 1, 5),
              ('customer_return', 'CRN-', 1, 5),
              ('bill', 'BILL-', 1, 5),
              ('supplier_payment', 'SPY-', 1, 5),
              ('supplier_return', 'SRN-', 1, 5)
       ON CONFLICT (doc_type) DO NOTHING`,
    );
    for (const permission of PERMISSIONS) {
      await client.query(
        `INSERT INTO permissions (code, module, action, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE
           SET module = EXCLUDED.module, action = EXCLUDED.action, description = EXCLUDED.description`,
        [...permission],
      );
    }
    const role = await client.query<{ id: string }>(
      `INSERT INTO roles (code, name, description, is_system)
       VALUES ($1, 'Company Admin', 'Full control of this company installation.', true)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [COMPANY_ADMIN_ROLE],
    );
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions
       ON CONFLICT DO NOTHING`,
      [role.rows[0].id],
    );

    const accountCount = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM accounts");
    if (accountCount.rows[0].count === "0") {
      const ids = new Map<string, string>();
      for (const account of STARTER_ACCOUNTS) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO accounts (
             code, name, account_type, account_subtype, parent_id, is_header, is_control, is_system, normal_balance
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            account.code,
            account.name,
            account.type,
            account.subtype ?? null,
            account.parent ? ids.get(account.parent) : null,
            account.header,
            account.control ?? false,
            account.system ?? false,
            account.type === "asset" || account.type === "expense" ? "debit" : "credit",
          ],
        );
        ids.set(account.code, inserted.rows[0].id);
      }
    }
    await client.query(
      `UPDATE sales_settings
          SET ar_control_account_id = (SELECT id FROM accounts WHERE code = '1200')
        WHERE id = 1
          AND ar_control_account_id IS NULL
          AND EXISTS (SELECT 1 FROM accounts WHERE code = '1200')`,
    );
    await client.query(
      `UPDATE purchasing_settings
          SET ap_control_account_id = (SELECT id FROM accounts WHERE code = '2100')
        WHERE id = 1
          AND ap_control_account_id IS NULL
          AND EXISTS (SELECT 1 FROM accounts WHERE code = '2100')`,
    );

    const yearCount = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM fiscal_years");
    if (yearCount.rows[0].count === "0") {
      const company = await client.query<{ fiscal_year_start_month: number; timezone: string }>(
        "SELECT fiscal_year_start_month, timezone FROM company WHERE id = 1",
      );
      const today = todayInTimeZone(company.rows[0].timezone);
      const start = currentFiscalStart(today, company.rows[0].fiscal_year_start_month);
      const built = buildMonthlyPeriods(start);
      const year = await client.query<{ id: string }>(
        `INSERT INTO fiscal_years (name, start_date, end_date, status)
         VALUES ($1, $2, $3, 'open') RETURNING id`,
        [fiscalYearName(start, built.endDate), start, built.endDate],
      );
      for (const period of built.periods) {
        await client.query(
          `INSERT INTO fiscal_periods (fiscal_year_id, period_no, name, start_date, end_date, status)
           VALUES ($1, $2, $3, $4, $5, 'open')`,
          [year.rows[0].id, period.periodNo, period.name, period.startDate, period.endDate],
        );
      }
    }

    const profileCount = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM accounting_profiles",
    );
    if (profileCount.rows[0].count === "0") {
      await client.query(
        `INSERT INTO accounting_profiles (country_code, name, compliance_status, notes, effective_from)
         VALUES ('ZZ', 'Unspecified country', 'unverified',
           'No country pack is active. Tax and statutory rules are not verified.', CURRENT_DATE)`,
      );
    }

    const userCount = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
    if (userCount.rows[0].count === "0") {
      if (!config.bootstrapAdminEmail || !config.bootstrapAdminPassword) {
        console.log("No users exist. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, then run seed again.");
        return;
      }
      assertPassword(config.bootstrapAdminPassword);
      const passwordHash = await hashPassword(config.bootstrapAdminPassword);
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, display_name, must_change_password)
         VALUES ($1, $2, 'Company Admin', true)
         RETURNING id`,
        [config.bootstrapAdminEmail.toLowerCase(), passwordHash],
      );
      await client.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [
        user.rows[0].id,
        role.rows[0].id,
      ]);
      console.log(`Created company admin ${config.bootstrapAdminEmail.toLowerCase()}. Change this password at first sign-in.`);
    }
  });
}

if (require.main === module) {
  seed()
    .then(async () => {
      await closePool();
      console.log("Seed complete.");
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await closePool();
      process.exit(1);
    });
}
