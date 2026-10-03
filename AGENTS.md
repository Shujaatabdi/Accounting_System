# Agent instructions

This repository is the local Accounting System at the configured GitHub remote `https://github.com/Shujaatabdi/Accounting_System.git`. Ignore any previous Cursor cloud project or pull request.

## Product rules

- One company per installation. Do not add tenants, a super admin, or multi-company filters.
- PostgreSQL only. Money and quantities use `numeric` and decimal strings, never binary floats.
- Posted journals are immutable. Corrections are reversals. Drafts do not hit official reports.
- Country and accounting settings are configurable per installation. Do not hard-code one country's tax rules.
- One company currency in the initial version. Store the currency name and symbol on the company profile. No foreign-currency accounting.
- Permissions are configurable by action and, where relevant, by branch. The frontend may hide actions, but the API enforces authorization.
- Keep an audit history for important actions, written in the same database transaction as the change.
- Phases 1 through 3 are implemented, including customers, sales, suppliers, and purchasing. Do not implement Phase 4 inventory quantities or banking; that work is deferred. Phase 5 costing and manufacturing depend on Phase 4 and stay last. FIFO versus weighted average is undecided; ask before implementing costing. Do not implement a Phase 6 feature until it is explicitly requested.
- Do not vendor Metronic. It is commercial and not licensed in this repo. The frontend is our own Next.js App Router UI.
- Keep `docs` aligned with the code. Do not describe a feature as implemented unless it exists here.
- Schema changes go in a new SQL migration. Do not edit an applied migration.
- Do not commit secrets. Windows setup is in the root `README.md`.
- Phases 1 through 3 are complete. Stop after a phase and wait for review before the next one. A country code, time zone, tax identifier, or business type must not select tax rules. A reviewed accounting profile is an acknowledgement, not a statutory rule set. Statutory reports need an explicit specification and a confirmed filing calendar and currency. Business-specific workflows need the business type and the behavior named first. Manual ATL recording is implemented for customers and suppliers and is copied onto an invoice or bill at posting. Do not add an FBR or IRIS connection or store login credentials.

## Required backend architecture

Backend code is TypeScript, Express, and PostgreSQL under `accbackend`. Future work uses this layout:

```text
accbackend/src/
├── app.ts
├── server.ts
├── config/
├── db/
├── middleware/
├── shared/
├── controllers/
├── routes/
├── modules/<feature>/
└── types/
```

`controllers/` and `routes/` each have an `index.ts` aggregator and one file per feature. Do not put route or controller files inside `modules/`.

Layer rules:

- `routes/<feature>.routes.ts` defines endpoints, attaches middleware, and calls controllers. No SQL and no accounting rules.
- `controllers/<feature>.controller.ts` turns an HTTP request into a service call and formats the HTTP response. No SQL and no accounting rules.
- `modules/<feature>/*.schemas.ts` validates bodies, path parameters, and query parameters.
- `modules/<feature>/*.service.ts` enforces business rules and coordinates work. It opens a transaction when more than one write must succeed or fail together.
- `modules/<feature>/*.repository.ts` contains PostgreSQL queries only. Every function accepts an explicit pool or transaction client. Repositories do not begin, commit, or roll back transactions.
- `db/transaction.ts` begins, commits, or rolls back, and the same client is passed through every service and repository in that unit of work.
- `middleware/` authenticates, authorizes, attaches request context, handles unknown routes, and maps errors.
- `shared/` is only for utilities used by more than one feature. Feature rules stay in that feature.

`app.ts` mounts the versioned router from `routes/index.ts`. `server.ts` listens and shuts the pool down.

Journal posting stays atomic. Application checks and database triggers are both required. Keep balancing, fiscal-period checks and locking, audit-in-transaction, posted immutability, and reversal behavior. Invoices, bills, returns, and later documents must call `modules/ledger` to post or reverse a journal. They must not copy those rules.

Company configuration that already exists (numbering, tax codes, and the accounting profile) stays on the company route and in `modules/company`. The audit list stays on the users route. The dashboard stays on the reports route. Do not drop these endpoints.

## Required frontend architecture

Frontend code is TypeScript and the Next.js App Router under `accfrontend`.

- `src/app/` owns URLs, layouts, and thin pages. A page composes feature components. It does not call the API.
- `src/features/<feature>/` owns that feature's UI, API calls, hooks, schemas, and types. Create a folder when the feature exists. Do not add empty feature folders.
- Do not import another feature's internal files. If a feature must be reused, export it from that feature's `index.ts`.
- `src/components/` holds shared layout, form, table, and UI primitives.
- `src/lib/api/` is the only HTTP client, including authentication headers and API errors.
- `src/providers/` holds application-wide providers.
- `src/hooks/` is only for hooks used by more than one feature.
- Loading, empty, error, and success states stay consistent.
- Accounting rules and authorization stay on the backend.

## Current and planned scope

Implemented now: company profile, users, roles, permissions, branches, chart of accounts, fiscal periods, manual journals, approvals, posting, reversals, audit, trial balance, profit and loss, balance sheet, general ledger, customers, products and services, sales invoices, receipts, allocations, customer returns, receivables aging, customer statements, the sales report, suppliers, supplier bills, supplier payments and allocations, supplier returns, payables aging, supplier statements, the purchases and supplier-return reports, and manual ATL records for customers and suppliers, including the posting snapshot on invoices and bills.

Deferred in Phase 4: warehouse quantities, stock movements, and banking. Not started, and last, in Phase 5: inventory valuation, cost of goods sold, costing, and manufacturing. Phase 5 depends on Phase 4. An FBR or IRIS connection and stored login credentials are out of scope. Statutory reports and business-specific workflows are not built.
