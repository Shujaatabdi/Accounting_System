# Product requirements

## Goal

Provide double-entry accounting for one company on a dedicated installation. The company administrator controls users, settings, branches, and the chart of accounts. The same product should be configurable for different countries and business types without hard-coding one country's tax rules.

## Users

- Company Admin: full control of that installation.
- Company users: access limited by role, action, and optional branch.

There is no super admin and no tenant switcher. Deployment is an operational task outside the application.

## Implemented in Phases 1 through 3

- Company profile, currency, time zone, fiscal calendar, numbering, and an effective-dated accounting profile. `reviewed` is an administrator acknowledgement, not a statutory rule set or certification.
- Configurable permissions, branch scope, and an audit trail.
- Chart of accounts and balanced journals. Ordinary manual journals cannot post to the receivable or payable control account.
- Approval before posting, with an optional rule that the approver is not the submitter.
- Period close and reopen.
- Trial balance, profit and loss, balance sheet, general ledger, and journal report from posted activity, plus CSV export and a print view.
- Customers, products and services, sales invoices, receipts, allocations, customer returns, receivables aging, customer statements, and the sales report.
- Suppliers, supplier bills, supplier payments and allocations, supplier returns, payables aging, supplier statements, and the purchases and supplier-return reports.
- Tax codes with sales and purchase accounts. Invoice and bill tax uses the company pricing mode and the tax code on the line. A country code, time zone, tax identifier, or business type does not choose that rate.

## Acceptance criteria for the foundation

- A posted journal has equal debits and credits, at least two lines, and a posting date in an open period.
- Draft, submitted, approved, and void journals do not appear on official reports.
- A posted journal cannot be edited or deleted through the API or by a direct SQL update of its business fields.
- A reversal posts the opposite amounts and leaves the trial balance in balance.
- Reports state whether they balance.
- Money is stored as `numeric(19,4)` and accepted as decimal strings.

## Customer and supplier returns

Customer and supplier returns are implemented. A linked return uses the source line’s saved price, discount, tax, and accounts. Posting rejects a quantity or value above the remainder and rejects a voided or reversed source. Disposition is stored. It does not move warehouse quantity or change inventory value. An unreferenced return needs its own permission, a reason, and explicit price and accounts. There is no stock-handling workflow yet.

## Deferred and later phases

Phase 4, inventory quantities and banking, is deferred. It is not built. Warehouses, stock movements, bank accounts, and reconciliation are not in this installation.

Phase 5, costing and manufacturing, depends on Phase 4 and stays last. The books must not present stock value or cost of goods sold until that add-on exists. FIFO versus weighted average is not decided. Bills of materials and manufacturing come after costing.

Phase 6 manual ATL recording is implemented. Staff enter an active or inactive status, a check date and time, and a reference for a customer or supplier when the company country and that party’s tax country are both Pakistan. Posting an invoice or bill keeps a historical copy. That copy does not change tax or the journal. An FBR or IRIS connection, and stored login credentials, are out of scope. A statutory report requires a named report, its lines, its sources, and a confirmed company filing calendar and currency. A business-specific workflow requires the business type and the different behavior to be named first. Foreign-currency accounting remains out of scope.

There is no company business-type field. Product type is `stock`, `non_stock`, or `service`. `stock` does not track quantity. Party type is the Pakistan tax classification `individual`, `company`, or `aop`, and only when that party’s tax country is `PK`. None of these selects a tax regime.
