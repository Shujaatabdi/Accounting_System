# Architecture

Each customer installation has one PostgreSQL database, one API, and one frontend. The database holds one company row. There is no tenant id and no Super Admin role.

```text
Browser (Next.js, accfrontend)
        |  HTTPS, Bearer token
Express API (accbackend, /api/v1)
        |  node-postgres, one transaction client
PostgreSQL
```

The API owns posting rules and authorization. The frontend may hide an action the user cannot perform. It does not decide whether a journal balances or whether a period is open. Official reports include only `journal_entries.status = 'posted'`.

## Request flow

1. `server.ts` loads the environment and listens. `app.ts` does not listen.
2. `middleware/request-context.ts` assigns `X-Request-Id`.
3. `routes/index.ts` mounts the feature routers on `/api/v1`.
4. Public auth routes sit in front of `requireAuth`. Every other route passes through authentication and the password-change gate.
5. A route file attaches permission middleware and calls a controller.
6. The controller validates input with the feature schema, calls a service, and writes the HTTP response.
7. The service applies accounting and access rules. When several writes belong together, it calls `withTransaction` and passes that client to every repository it uses.
8. `middleware/error-handler.ts` turns application errors and known PostgreSQL errors into the JSON error shape. `middleware/not-found.ts` handles unknown paths.

## Backend layout

```text
accbackend/src/
├── app.ts
├── server.ts
├── config/
│   ├── env.ts
│   └── logger.ts
├── db/
│   ├── pool.ts
│   ├── transaction.ts
│   ├── migrate.ts
│   ├── seed.ts
│   └── embedded.ts
├── middleware/
│   ├── authenticate.ts
│   ├── authorize.ts
│   ├── error-handler.ts
│   ├── not-found.ts
│   └── request-context.ts
├── shared/
│   ├── errors/
│   ├── http/
│   ├── money/
│   ├── dates/
│   └── audit/
├── controllers/
│   ├── index.ts
│   └── <feature>.controller.ts
├── routes/
│   ├── index.ts
│   └── <feature>.routes.ts
├── modules/
│   ├── auth/
│   ├── company/
│   ├── users/
│   ├── roles/
│   ├── branches/
│   ├── accounts/
│   ├── periods/
│   ├── journals/
│   ├── ledger/
│   └── reports/
└── types/
```

Each feature module has a service, a repository, and, when it accepts HTTP input, a schema and a types file. Company configuration that is already implemented (document numbering, tax codes, and the accounting profile) lives in `modules/company` and is registered from `company.routes.ts`. The audit list is registered from `users.routes.ts`. The dashboard is registered from `reports.routes.ts`. Those are current endpoints, not new products.

`embedded.ts` is the local Windows PostgreSQL process used by `npm run db:embedded`. Production uses a normal PostgreSQL service.

## Transactions and posting

`db/transaction.ts` is the only place that begins, commits, or rolls back. A repository function receives the pool for a single read, or the transaction client when the caller opened a transaction. It does not open another transaction.

Posting a journal is one transaction:

1. The journal service checks the workflow state.
2. `modules/ledger` locks the lines, checks that the entry balances, checks that every account is postable, and locks the fiscal period and year.
3. The ledger service snapshots account code and name, then marks the journal posted.
4. The journal service writes the audit row on the same client.

Database triggers in `001_foundation.sql` repeat the immutability, balance, snapshot, and approved-status checks. A reversal is a new posted journal. It swaps debit and credit, copies the snapshots, and sets the transaction-local `acc.allow_system_post` flag so the trigger accepts the system post. The original journal stays posted and records `reversed_by_entry_id`.

Invoices, receipts, receipt allocations, and customer returns call the ledger service inside their own transaction. Bills must do the same. They must not duplicate balance, period, snapshot, or immutability rules.

Money is `numeric` in PostgreSQL and decimal strings in the API. The application uses `decimal.js`. Date columns stay `YYYY-MM-DD` strings.

## Frontend layout

```text
accfrontend/src/
├── app/
│   ├── layout.tsx
│   ├── providers.tsx
│   ├── (auth)/login/
│   └── (dashboard)/
│       ├── dashboard/
│       ├── company/
│       ├── users/
│       ├── roles/
│       ├── branches/
│       ├── accounts/
│       ├── periods/
│       ├── journals/
│       └── reports/
├── features/
│   ├── auth/
│   ├── company/
│   ├── users/
│   ├── roles/
│   ├── branches/
│   ├── accounts/
│   ├── periods/
│   ├── journals/
│   └── reports/
├── components/layout/
├── lib/api/
├── lib/auth/
├── lib/formatting/
├── providers/
├── hooks/
└── styles/
```

Pages compose feature screens. Feature screens call `lib/api/client.ts`. The earlier `/fiscal` URL redirects to `/periods`. Journal create and edit, the password change page, audit, numbering, tax codes, the accounting profile, and the journal report remain available because they are already implemented.

Shared UI primitives live in `components/`. There is no Metronic code in this repository.

## What is implemented

Phase 1 and Phase 2 are implemented: one company, users and roles, branches, fiscal periods, chart of accounts, draft-to-posted journals, reversals, audit, trial balance, general ledger, profit and loss, balance sheet, customers, products, sales invoices, receipts, customer returns, and receivables reports.

Not implemented: suppliers, purchasing, inventory quantities, inventory valuation, cost of goods sold, costing, and manufacturing. Costing method is undecided.

## Deployment

One installation is one company. Run PostgreSQL, apply `accbackend` migrations, seed once, start `accbackend` (`server.ts`), and serve `accfrontend` against `NEXT_PUBLIC_API_URL`. Do not share one database across companies.

## Metronic

Target compatibility is Metronic v9 for Next.js, changelog v9.4.8 on 26 March 2026, built for Next.js 16 and React 19. The frontend in this repo uses those framework versions.

Metronic is sold by KeenThemes. The license terms reviewed on 1 October 2026 (page last updated 30 June 2026) are commercial: a Regular license covers one end product whose end users are not charged, and an Extended license covers a product whose end users pay. KeenThemes also states that each production deployment needs its own license. No Metronic files are in this repository, and none should be copied in until the purchaser confirms the license tier for paid, dedicated installations.

The current UI is original. It uses a sidebar, document lists, and report pages so a licensed Metronic shell can replace the presentation later without changing the API.

## Local database

`npm run db:embedded` in `accbackend` starts PostgreSQL for development when a system install is not available. Production should use a normal PostgreSQL service, not the embedded process.
