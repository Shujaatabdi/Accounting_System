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
| Sales settings | `GET /sales-settings`, `PUT /sales-settings` |
| Customers | `GET/POST /customers`, `GET/PUT /customers/:id`, `GET /customers/:id/balance`, `GET /customers/:id/history`, `PUT /customers/opening-details` |
| Products | `GET/POST /products`, `GET/PUT /products/:id`, `GET/POST /product-categories`, `PUT /product-categories/:id`, `GET/POST /units` |
| Invoices | `GET/POST /invoices`, `GET/PUT /invoices/:id`, plus `/submit`, `/reject`, `/approve`, `/post`, `/void`, `/reverse` |
| Receipts | `GET/POST /receipts`, `GET/PUT /receipts/:id`, plus `/submit`, `/reject`, `/approve`, `/post`, `/void`, `/reverse`, `/allocations`, and `/allocations/:allocationId/unallocate` |
| Customer returns | `GET/POST /customer-returns`, `GET/PUT /customer-returns/:id`, plus `/submit`, `/reject`, `/approve`, `/post`, `/void`, `/reverse` |
| Reports | `GET /reports/trial-balance`, `/profit-and-loss`, `/balance-sheet`, `/general-ledger`, `/journals`, `/receivables-aging`, `/customer-statement`, `/sales` |
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

`sourceType` is `manual` or `opening_balance`. Reversals are created only by `POST /journals/:id/reverse` with `{ "reason", "postingDate?" }`. A manual journal cannot use the receivable control account. An opening-balance receivable line must match `PUT /customers/opening-details` before it can be submitted. Do not reverse an invoice, receipt, allocation, or customer-return journal from the journals endpoint; reverse the source document.

## Sales documents

Invoice, receipt, and return bodies use the same draft, submit, approve, and post flow as journals. Amounts are decimal strings. A linked return line sends `invoiceLineId` and `quantity`. An unreferenced return also requires `customer_returns.create_unreferenced`, a reason, product, price, tax code, and return account. Posting a return locks the source invoice line and rejects a quantity or value above the remainder. Reversing an invoice fails while a posted allocation or posted return still applies. The default receipt treatment needs `customerAdvanceAccountId` on sales settings. Receivables reports return `409` when customer detail does not equal the receivable control account. Aging omits unapplied advances.

## Status codes

`400` validation or unbalanced journal, `401` sign-in, `403` permission, branch, or password change required, `404` missing, `409` closed period, locked currency, or a database rule.
