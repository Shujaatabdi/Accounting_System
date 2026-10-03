# Deployment

Provision one database, one API, and one frontend per company. Do not point two companies at the same database.

## Configuration

Set these on the API host. Do not reuse the values from `.env.example`.

- `DATABASE_URL` — PostgreSQL connection string for that company
- `JWT_SECRET` — at least 16 random characters; production refuses the sample secret
- `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` — used only when the database has no users
- `CORS_ORIGIN` — the frontend origin
- `PORT` — API port, default 4000
- `NODE_ENV=production`

The frontend needs `NEXT_PUBLIC_API_URL` at build time.

## Upgrade

1. Back up the database.
2. Deploy the new API build.
3. From `accbackend`, run `npm run migrate`. Migrations run in a transaction and are recorded in `schema_migrations`. Later additive files include `005_role_code_format.sql` and `006_manual_atl.sql`. `006_manual_atl.sql` adds the ATL columns and grants `customers.record_atl` and `suppliers.record_atl` to Company Admin. Do not edit an already applied migration.
4. Run `npm run seed` only to add newly shipped permissions, document sequences, or to fill an empty database. It does not reset posted journals or an existing chart. It links the payable control to existing account `2100` only when that account exists and the setting is still empty. It does not create a supplier-advance account.
5. Deploy the frontend.

## Backup and restore

Use `pg_dump` for the company database and restore with `pg_restore` or `psql` into an empty database. Take a backup before a migration. Test the restore on a separate server. The embedded development process is not a backup tool.

## Monitoring

`GET /api/v1/health` checks the process. `GET /api/v1/health/ready` checks the database. Log API errors. Watch disk, connection count, and slow report queries. There is no separate metrics stack in this phase.

## Secrets

Keep `.env` off the frontend host except the public API URL. Do not commit `.env`, database dumps, or customer documents. The local embedded password `postgres` is only for the development process started by `npm run db:embedded`.
