# Architecture

Each customer installation has one PostgreSQL database, one API, and one frontend. The database holds one company row. There is no tenant id on transactions.

```text
Browser (Next.js, accfrontend)
        |  HTTPS, Bearer token
Express API (accbackend, /api/v1)
        |  node-postgres, transactions
PostgreSQL 14+
```

The API owns posting rules. The frontend does not decide whether a journal balances or whether a period is open. Official reports query `journal_entries.status = 'posted'`.

## Boundaries

- `accbackend/src/db/migrations` is the schema.
- Services perform business changes inside `withTransaction`.
- Routes validate input with Zod. Amounts are strings so JSON numbers cannot round them.
- Audit rows are written in the same transaction as the change they describe.

## Authentication

Login returns a signed token that expires after eight hours. Each request reloads the user, role permissions, and branch scope. An inactive user is rejected even if the token has not expired. Logout writes an audit event and the browser drops the token. The server does not keep a revocation list.

## Metronic

Target compatibility is Metronic v9 for Next.js, changelog v9.4.8 on 26 March 2026, built for Next.js 16 and React 19. The frontend in this repo uses those framework versions.

Metronic is sold by KeenThemes. The license terms reviewed on 1 October 2026 (page last updated 30 June 2026) are commercial: a Regular license covers one end product whose end users are not charged, and an Extended license covers a product whose end users pay. KeenThemes also states that each production deployment needs its own license. No Metronic files are in this repository, and none should be copied in until the purchaser confirms the license tier for paid, dedicated installations.

The current UI is original. It uses a sidebar, document lists, and report pages so a licensed Metronic shell can replace the presentation later without changing the API.

## Local database

`npm run db:embedded` in `accbackend` starts PostgreSQL for development when a system install is not available. Production should use a normal PostgreSQL service, not the embedded process.
