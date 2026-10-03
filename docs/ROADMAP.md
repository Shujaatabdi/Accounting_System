# Roadmap

Status was checked against this local repository.

## Phase 1 — Company and accounting foundation — implemented

Implemented and covered by unit tests plus a PostgreSQL integration test:

- Company profile, addresses, contacts, currency, time zone, fiscal-year start month, logo URL, and document numbering.
- Country accounting profile with effective dates. Compliance stays unverified until an administrator marks it reviewed. That flag is not a statutory certification.
- Tax codes store a rate and optional sales and purchase accounts. Invoice tax and supplier-bill tax are calculated from the matching company pricing mode and the tax code on the line. The country code does not choose a rate.
- Users, roles, action permissions, branch scope, privilege ceiling, and audit log.
- Branches, chart of accounts, monthly fiscal years and periods, close and reopen.
- Manual journals and opening-balance journals: draft, submit, approve, post, reject, void, reverse.
- Database enforcement that posted journals balance and cannot be silently edited.
- Trial balance, profit and loss, balance sheet, general ledger, and journal report.
- CSV export and browser print for PDF.

Limitations inside this phase:

- Periods are calendar months from the first of the configured start month.
- Server-generated PDF files are not implemented.
- Sign-out does not revoke a token before it expires. Deactivating a user blocks the next request.
- The logo is a URL, not an uploaded file.
- Ordinary manual journals cannot post to the receivable control account or the payable control account. Opening-balance journals can post to those accounts only when the matching customer or supplier detail equals the line.

## Phase 2 — Customers and sales — implemented

Customers, products and services, invoices, receipts, allocations, statements, customer returns, and receivables aging. Posted documents call the ledger. Customer tax identifiers can be stored, and a sales setting can copy them onto an invoice at posting. Inventory quantity, inventory value, and cost of goods sold are not posted. Manual ATL recording is Phase 6. An FBR or IRIS connection is not part of the product.

## Phase 3 — Suppliers and purchasing — implemented

Suppliers, supplier-to-product links, supplier bills, supplier payments and allocations, supplier returns and debit notes, supplier statements, payables aging, and posted purchase and supplier-return reports. Posted documents call the ledger. A bill line posts to the product’s purchase expense account and the tax code’s purchase tax asset. It does not post an inventory asset. Unapplied supplier payments need a configured supplier-advance asset account. Payables aging uses open bills and excludes unapplied advances. Warehouse quantities and stock movements are deferred Phase 4. Inventory costing and valuation are Phase 5. Manual ATL recording is Phase 6. An FBR or IRIS connection is not part of the product.

## Phase 4 — Basic inventory and banking — deferred

Not a current priority. Do not start it until it is explicitly requested.

Planned scope, none of which is built: warehouses, quantities, transfers, counts, adjustments, stock returns, movement history, bank and cash accounts, and reconciliation. No stock value and no cost of goods sold. Product purchase accounts remain expenses. A return disposition is stored and does not move quantity.

## Phase 5 — Costing and manufacturing — not started

This stays last. It depends on Phase 4 quantity tracking and must not start while Phase 4 is deferred. Do not implement costing until the method is chosen. FIFO and weighted average are both still open. Bills of materials and manufacturing come after costing. The books must not present stock value or cost of goods sold before that add-on exists.

## Phase 6 — Country and business extensions — manual ATL only

A country code, time zone, fiscal-year start month, customer or supplier tax identifier, party type, or product type does not select tax rules.

A reviewed accounting profile is an administrator acknowledgement. It is not a statutory rule set and not a certification. Marking a profile reviewed does not create a tax return.

Statutory reports are not specified. One may be added only after the report, its lines, and its source accounts or documents are named, and after the company filing calendar and currency are confirmed. Until then, trial balance, profit and loss, balance sheet, general ledger, sales, purchases, and aging reports remain management reports.

Manual active-taxpayer (ATL) recording is implemented for customers and suppliers. Staff type the status, the check date and time, and a reference. The application does not look the status up and does not verify it. The controls appear only when the company country and the party’s tax country are both Pakistan. Posting an invoice or a bill copies the current record onto that document. Later edits to the party do not change a posted copy. The copy does not affect tax, withholding, further tax, journal entries, or whether the document can be posted. An FBR or IRIS connection is out of scope, and the system must not store login credentials for one.

A business-specific workflow is not built. Name the business type and the behavior that should differ before adding one. Inventory quantity, banking, costing, and manufacturing stay in Phases 4 and 5 even if a business type would need them.

## Suggested order

Phases 1 through 3 are complete. Phase 4 is deferred. Phase 5 waits for Phase 4 and for a costing method. Phase 6 manual ATL recording is implemented. Statutory reports and business-specific workflows still need an explicit specification. Do not implement Phase 4, Phase 5, or another Phase 6 feature until that work is explicitly requested.
