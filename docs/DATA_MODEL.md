# Data model

PostgreSQL 14 or newer. The migration is `accbackend/src/db/migrations/001_foundation.sql`. Later phases add new migrations; they do not rewrite this one.

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
| `document_sequences` | Next number, prefix, and padding. Phase 1 uses `journal` |
| `branches` | Locations. Code is unique |
| `users`, `roles`, `permissions` | People and the permission catalog |
| `user_roles`, `role_permissions`, `user_branches` | Assignments |
| `audit_log` | Actor, action, entity, before/after JSON |
| `fiscal_years`, `fiscal_periods` | Open or closed. Date ranges cannot overlap |
| `accounts` | Chart. Code is unique. Normal balance must match type |
| `accounting_profiles` | Effective-dated country profile |
| `tax_codes` | Effective-dated rates and optional tax accounts |
| `journal_entries`, `journal_lines` | Headers and lines. Posted lines snapshot account code and name |

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

## Not in this schema

Customers, suppliers, products, invoices, stock quantities, stock cost, banks, and manufacturing tables. Do not infer them from the receivable, payable, or retained-earnings accounts. Those accounts exist so manual journals and later modules have a place to post.
