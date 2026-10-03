# Data model

PostgreSQL 14 or newer. Migrations are `accbackend/src/db/migrations/001_foundation.sql`, `002_customers_sales.sql`, `003_customer_tax_profile.sql`, and `004_suppliers_purchasing.sql`. Later phases add new migrations; they do not rewrite an applied file.

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
| `document_sequences` | Next number, prefix, and padding for `journal`, `invoice`, `receipt`, `customer_return`, `bill`, `supplier_payment`, and `supplier_return` |
| `branches` | Locations. Code is unique |
| `users`, `roles`, `permissions` | People and the permission catalog |
| `user_roles`, `role_permissions`, `user_branches` | Assignments |
| `audit_log` | Actor, action, entity, before/after JSON |
| `fiscal_years`, `fiscal_periods` | Open or closed. Date ranges cannot overlap |
| `accounts` | Chart. Code is unique. Normal balance must match type |
| `accounting_profiles` | Effective-dated country profile |
| `tax_codes` | Effective-dated rates and optional tax accounts |
| `journal_entries`, `journal_lines` | Headers and lines. Posted lines snapshot account code and name. Source types include `invoice`, `receipt`, `receipt_allocation`, `customer_return`, `supplier_bill`, `supplier_payment`, `supplier_payment_allocation`, and `supplier_return` |
| `sales_settings` | Tax pricing mode, discount treatment, unapplied-receipt treatment, receivable control account, optional customer-advance account, and `show_customer_tax_identifiers` (default false) |
| `customers`, `customer_addresses`, `customer_contacts` | Customer master. Codes are unique. `tax_identifier` is generic. `tax_country_code`, `party_type`, `cnic_ntn`, `ntn_check_digit`, and `strn` are the optional Pakistan profile. `cnic_ntn` is 13 digits or 7 digits. The check digit is display only and is not verified |
| `customer_opening_details` | Customer amounts attached to an opening-balance receivable line. This is not a second journal |
| `product_categories`, `units`, `products`, `product_units` | Catalog. `products.purchase_account_id` is an optional expense account. No quantity-on-hand balance |
| `purchasing_settings` | Tax pricing mode, discount treatment, payable control account, optional supplier-advance asset, and `show_supplier_tax_identifiers` (default false) |
| `suppliers`, `supplier_addresses`, `supplier_contacts` | Supplier master. Codes are unique. Tax fields follow the customer profile. A non-`PK` tax country stores no party type, CNIC/NTN, check digit, or STRN |
| `supplier_opening_details` | Supplier amounts attached to an opening-balance payable line. This is not a second journal |
| `product_suppliers` | Many suppliers per product. Stores supplier item code, purchase price, lead time, and one preferred supplier per product |
| `supplier_bills`, `supplier_bill_lines` | Supplier bills. Posted lines store price, discount, tax mode, rate, base, tax, purchase account, and tax account. Posting may snapshot supplier tax details when the purchasing setting is on |
| `supplier_payments`, `supplier_payment_allocations` | Supplier payments. `ap_treatment` is `direct_ap` or `supplier_advance` |
| `supplier_returns`, `supplier_return_lines` | Debit notes. A linked line stores the source bill line. `disposition` is recorded and does not move quantity |
| `invoices`, `invoice_lines` | Sales invoices. Posted lines store price, discount, tax mode, rate, base, tax, and accounts. Posting may snapshot customer tax details when the sales setting is on |
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

## Payable control

Ordinary manual journals cannot post to the payable control account. Opening-balance journals can, and only when supplier opening detail equals the credit minus the debit of that line. Supplier bills, payments, allocations, returns, and reversals can post to it. A database trigger enforces the same source-type rule. The supplier-advance account is an asset and is not the payable control.

## Not in this schema

Warehouse quantities, stock movements, inventory valuation, cost of goods sold, banks, and manufacturing tables. A purchase account is an expense. Do not infer inventory balances from the product catalog or from supplier bills and returns. Stock receipt and return quantities belong to Phase 4. Inventory costing and valuation belong to Phase 5.
