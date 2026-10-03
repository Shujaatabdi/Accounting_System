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
- Control accounts can still be used on manual journals because there is no subledger yet.

## Phase 2 — Customers and sales — implemented

Customers, products and services, invoices, receipts, allocations, statements, customer returns, and receivables aging. Posted documents call the ledger. Customer tax identifiers can be stored, and a sales setting can copy them onto an invoice at posting. Inventory quantity, inventory value, and cost of goods sold are not posted. ATL tracking and FBR/IRIS connections are not in this phase.

## Phase 3 — Suppliers and purchasing — implemented

Suppliers, supplier-to-product links, supplier bills, supplier payments and allocations, supplier returns and debit notes, supplier statements, payables aging, and posted purchase and supplier-return reports. Posted documents call the ledger. A bill line posts to the product’s purchase expense account and the tax code’s purchase tax asset. It does not post an inventory asset. Unapplied supplier payments need a configured supplier-advance asset account. Payables aging uses open bills and excludes unapplied advances. Warehouse quantities and stock movements are Phase 4. Inventory costing and valuation are Phase 5. ATL tracking and FBR/IRIS connections are not in this phase.

## Phase 4 — Basic inventory and banking — not started

Warehouses, quantities, transfers, counts, adjustments, returns, movement history, bank and cash accounts, and reconciliation. No stock value and no cost of goods sold.

## Phase 5 — Costing and manufacturing — not started

Do not implement until the costing method is chosen. FIFO and weighted average are both still open. Bills of materials and manufacturing come after costing.

## Phase 6 — Country and business extensions — not started

Country tax and statutory reports only after a country is selected and reviewed. Active taxpayer (ATL) tracking and FBR/IRIS connections, if added, belong here. Business-specific workflows and integrations come after that.

## Suggested order after review

Phase 3 is implemented. Do not start Phase 4, Phase 5, or Phase 6 until that work is explicitly requested. Phase 4 is stock quantity handling. Phase 5 is costing and valuation, and the costing method is still undecided.
