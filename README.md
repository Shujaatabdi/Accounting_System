# Accounting System

One-company accounting software. Each customer gets a dedicated installation with its own PostgreSQL database, Express API, and Next.js frontend. It is not a multi-tenant SaaS product.

Phases 1 through 3 are implemented: company settings, users and permissions, the chart of accounts, fiscal periods, journals, financial statements, customers and sales, and suppliers and purchasing. Warehouse quantities, inventory valuation, banking, costing, and manufacturing are not built yet. See `docs/ROADMAP.md`.

## Prerequisites

- Node.js 22 or newer
- npm
- PostgreSQL 14 or newer

On this Windows machine, PostgreSQL does not have to be installed system-wide. The backend can start a local PostgreSQL 18 instance for development.

## Configure

From the repository root in PowerShell:

```powershell
cd accbackend
Copy-Item .env.example .env
cd ..\accfrontend
Copy-Item .env.example .env.local
```

Edit `accbackend/.env` before any shared or production use. Replace `JWT_SECRET` and `BOOTSTRAP_ADMIN_PASSWORD`. The sample values are for a private local database only. Do not commit `.env`.

`DATABASE_URL` defaults to `postgres://postgres:postgres@localhost:5432/accounting`.

## Run locally

Use three PowerShell windows, all starting from the repository root.

```powershell
cd accbackend
npm install
npm run db:embedded
```

Leave that window open. Then:

```powershell
cd accbackend
npm run migrate
npm run seed
npm run dev
```

The API listens on port 4000. Then:

```powershell
cd accfrontend
npm install
npm run dev
```

Open `http://localhost:3000`. The seed creates `admin@example.com` with the password from `.env`. The first sign-in must change that password.

If you already run PostgreSQL, skip `npm run db:embedded`, create an empty database named `accounting`, and point `DATABASE_URL` at it.

## Checks

```powershell
cd accbackend
npm run typecheck
npm test
npm run test:integration
```

`npm test` checks money, dates, journal validation, report math, and supplier-payment splits without a database. `npm run test:integration` starts a temporary PostgreSQL instance and checks posting, sales documents, and supplier bills, returns, and payments.

```powershell
cd accfrontend
npm run typecheck
npm run build
```

## Repository layout

- `accbackend` — Express and TypeScript API
- `accfrontend` — Next.js and TypeScript UI
- `docs` — product and technical documentation

Application source does not live in `docs`.

## Metronic

The compatible commercial template is Metronic v9 Next.js (changelog v9.4.8, 26 March 2026; Next.js 16 and React 19). It is a KeenThemes product, last licensed 30 June 2026, and it is not included here. See `docs/ARCHITECTURE.md`.

## Git

Work on `main` in this checkout. Remote: `https://github.com/Shujaatabdi/Accounting_System.git`. Do not commit `.env`, `.pgdata`, or real credentials. Do not reset history. Commit and push only the files for the milestone you mean to publish.
