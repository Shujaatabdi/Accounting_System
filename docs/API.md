# API

Base path: `/api/v1`. JSON errors look like `{ "error": { "code", "message", "details?" } }`.

Send `Authorization: Bearer <token>` except for health and login. Amounts are strings such as `"10.50"`, not JSON numbers. Dates are `YYYY-MM-DD`. Lists use `page` and `pageSize` (maximum 100) and return `{ data, page, pageSize, total }`.

## Authentication

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | Current user, permissions, branch scope |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` → `{ token }` |
| POST | `/auth/logout` | 204 |

Health: `GET /health`, `GET /health/ready`.

## Resources

| Area | Methods and paths |
| --- | --- |
| Dashboard | `GET /dashboard` |
| Company | `GET /company`, `PUT /company` |
| Numbering | `GET /numbering`, `PUT /numbering/:docType` |
| Country profile | `GET /accounting-profile`, `PUT /accounting-profile` |
| Tax codes | `GET /tax-codes`, `POST /tax-codes`, `POST /tax-codes/:id/retire` |
| Branches | `GET /branches`, `POST /branches`, `PUT /branches/:id` |
| Users | `GET /users`, `POST /users`, `PUT /users/:id` |
| Roles | `GET /permissions`, `GET /roles`, `POST /roles`, `PUT /roles/:id` |
| Accounts | `GET /accounts`, `POST /accounts`, `PUT /accounts/:id`, `DELETE /accounts/:id` |
| Fiscal | `GET /fiscal-years`, `POST /fiscal-years`, close and reopen on `/fiscal-years/:id` and `/fiscal-periods/:id` |
| Journals | `GET/POST /journals`, `GET/PUT /journals/:id`, plus `/submit`, `/reject`, `/approve`, `/post`, `/void`, `/reverse` |
| Reports | `GET /reports/trial-balance`, `/profit-and-loss`, `/balance-sheet`, `/general-ledger`, `/journals` |
| Audit | `GET /audit` |

`GET /accounts?postable=true` returns accounts that can be used on a journal. Report query `format=csv` requires `reports.export` and returns a spreadsheet file. Official report rows are posted activity by posting date.

## Journal body

```json
{
  "entryDate": "2026-01-01",
  "description": "Opening cash",
  "sourceType": "manual",
  "lines": [
    { "accountId": "...", "debit": "100.00", "credit": "0.00" },
    { "accountId": "...", "debit": "0.00", "credit": "100.00" }
  ]
}
```

`sourceType` is `manual` or `opening_balance`. Reversals are created only by `POST /journals/:id/reverse` with `{ "reason", "postingDate?" }`.

## Status codes

`400` validation or unbalanced journal, `401` sign-in, `403` permission, branch, or password change required, `404` missing, `409` closed period, locked currency, or a database rule.
