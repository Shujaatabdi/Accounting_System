# Roadmap

Status was checked against this local repository.

## Phase 1 — Company and accounting foundation — implemented

Implemented and covered by unit tests plus a PostgreSQL integration test:

- Company profile, addresses, contacts, currency, time zone, fiscal-year start month, logo URL, and document numbering.
- Country accounting profile with effective dates. Compliance stays unverified until an administrator marks it reviewed. That flag is not a statutory certification.
- Tax code configuration only. No invoice tax calculation.
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

## Phase 2 — Customers and sales — not started

Customers, products and services, invoices, receipts, allocations, statements, customer returns with product-level account adjustments, and receivables aging.

## Phase 3 — Suppliers and purchasing — not started

Suppliers, bills, payments, allocations, statements, supplier returns with product-level account adjustments, and payables aging.

## Phase 4 — Basic inventory and banking — not started

Warehouses, quantities, transfers, counts, adjustments, returns, movement history, bank and cash accounts, and reconciliation. No stock value and no cost of goods sold.

## Phase 5 — Costing and manufacturing — not started

Do not implement until the costing method is chosen. FIFO and weighted average are both still open. Bills of materials and manufacturing come after costing.

## Phase 6 — Country and business extensions — not started

Country tax and statutory reports only after a country is selected and reviewed. Business-specific workflows and integrations come after that.

## Suggested order after review

Finish Phase 1 review, then Phase 2. Each phase should migrate, stay runnable, and update these docs before the next one starts.
