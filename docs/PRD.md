# Product requirements

## Goal

Provide double-entry accounting for one company on a dedicated installation. The company administrator controls users, settings, branches, and the chart of accounts. The same product should be configurable for different countries and business types without hard-coding one country's tax rules.

## Users

- Company Admin: full control of that installation.
- Company users: access limited by role, action, and optional branch.

There is no super admin and no tenant switcher. Deployment is an operational task outside the application.

## In scope for the implemented foundation

- Company profile, currency, time zone, fiscal calendar, numbering, and an unverified country profile.
- Configurable permissions and an audit trail.
- Chart of accounts and balanced journals.
- Approval before posting, with an optional rule that the approver is not the submitter.
- Period close and reopen.
- Trial balance, profit and loss, balance sheet, general ledger, and journal report from posted activity.
- CSV export and a print view.

## Acceptance criteria for the foundation

- A posted journal has equal debits and credits, at least two lines, and a posting date in an open period.
- Draft, submitted, approved, and void journals do not appear on official reports.
- A posted journal cannot be edited or deleted through the API or by a direct SQL update of its business fields.
- A reversal posts the opposite amounts and leaves the trial balance in balance.
- Reports state whether they balance.
- Money is stored as `numeric(19,4)` and accepted as decimal strings.

## Explicitly out of scope until a later phase

Customers, suppliers, products, invoices, bills, receipts, payments, returns, inventory quantities, stock valuation, manufacturing, bank reconciliation, foreign currency, and statutory returns for a named country.

## Returns, when their phase starts

Customer and supplier returns will capture quantity, reason, source document when available, location, condition, approval, posting, stock handling, and product-level account adjustments. Damaged, non-restockable, and unreferenced returns need an explicit accounting treatment. That workflow is not in the current build.

## Inventory costing

Basic quantity tracking is planned before costing. The books must not present stock value or cost of goods sold until a costing add-on exists. FIFO versus weighted average is not decided.
