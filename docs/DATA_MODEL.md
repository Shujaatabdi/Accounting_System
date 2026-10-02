# Data model

PostgreSQL 14 or newer. Migrations are `accbackend/src/db/migrations/001_foundation.sql` and `002_customers_sales.sql`. Later phases add new migrations; they do not rewrite an applied file.

## Precision and identity

- Money: `numeric(19,4)`. API amounts are decimal strings.
- Tax rate: `numeric(8,4)` percentage from 0 to 100.
- Dates: `date` for accounting dates, `timestamptz` for audit and workflow times.
- The API parses `date` as `YYYY-MM-DD` text so time zones cannot shift the calendar day.
- Primary keys are `uuid` except the singleton `company.id`, which must be `1`.

## Main tables

| Table | Role |
| --- | --- |
| `company` | Legal name, country, currency, time zone, fiscal start month, approver rule |
| `company_addresses`, `company_contacts` | Addresses and contacts; at most one primary each |
| `document_sequences` | Next number, prefix, and padding for `journal`, `invoice`, `receipt`, and `customer_return` |
| `branches` | Locations. Code is unique |
| `users`, `roles`, `permissions` | People and the permission catalog |
| `user_roles`, `role_permissions`, `user_branches` | Assignments |
| `audit_log` | Actor, action, entity, before/after JSON |
| `fiscal_years`, `fiscal_periods` | Open or closed. Date ranges cannot overlap |
| `accounts` | Chart. Code is unique. Normal balance must match type |
| `accounting_profiles` | Effective-dated country profile |
| `tax_codes` | Effective-dated rates and optional tax accounts |
| `journal_entries`, `journal_lines` | Headers and lines. Posted lines snapshot account code and name. Source types include `invoice`, `receipt`, `receipt_allocation`, and `customer_return` |
| `sales_settings` | Tax pricing mode, discount treatment, unapplied-receipt treatment, receivable control account, and optional customer-advance account |
| `customers`, `customer_addresses`, `customer_contacts` | Customer master. Codes are unique |
| `customer_opening_details` | Customer amounts attached to an opening-balance receivable line. This is not a second journal |
| `product_categories`, `units`, `products`, `product_units` | Catalog. No quantity-on-hand balance |
| `invoices`, `invoice_lines` | Sales invoices. Posted lines store price, discount, tax mode, rate, base, tax, and accounts |
| `receipts`, `receipt_allocations` | Customer receipts and the invoices they pay |
| `customer_returns`, `customer_return_lines` | Returns. A linked line stores the source invoice line |

## Journal status

`draft`, `pending_approval`, `approved`, `posted`, `void`.

A reversal keeps the original `posted` and sets `reversed_by_entry_id`. The new row uses source type `reversal` and `reverses_entry_id`.

## Constraints that protect the books

- Line checks: non-negative amounts, not both sides, not a zero line.
- Posting trigger: at least two lines, debits equal credits, posting date, period, poster, and account snapshots.
- Posted header and line triggers reject business-field edits.
- Account check: debit-normal types cannot be stored as credit-normal.
- Fiscal ranges use an exclusion constraint so years and periods cannot overlap.

## Indexes

Posted journals are indexed by posting date. Lines are indexed by account, entry, and branch. Audit is indexed by time, entity, and actor. These support the Phase 1 reports. Large ledgers should be profiled before adding summary tables.

## Receivable control

Ordinary manual journals cannot post to the receivable control account. Opening-balance journals can, and only when customer opening detail equals that line. Customer documents and reversals can post to it. A database trigger enforces the same source-type rule.

## Not in this schema

Suppliers, bills, stock quantities, stock cost, banks, and manufacturing tables. The payable account is reserved for a later phase. Do not infer inventory balances from the product catalog.
