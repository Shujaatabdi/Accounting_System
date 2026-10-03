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
| Tax codes | `GET /tax-codes`, `POST /tax-codes`, `PUT /tax-codes/:id`, `POST /tax-codes/:id/retire` |
| Branches | `GET /branches`, `GET /branches/accessible`, `POST /branches`, `PUT /branches/:id` |
| Users | `GET /users`, `POST /users`, `PUT /users/:id` |
| Roles | `GET /permissions`, `GET /roles`, `POST /roles`, `PUT /roles/:id` |
| Accounts | `GET /accounts`, `POST /accounts`, `PUT /accounts/:id`, `DELETE /accounts/:id` |
| Fiscal | `GET /fiscal-years`, `POST /fiscal-years`, close and reopen on `/fiscal-years/:id` and `/fiscal-periods/:id` |
| Journals | `GET/POST /journals`, `GET/PUT /journals/:id`, plus `/submit`, `/reject`, `/approve`, `/post`, `/void`, `/reverse` |
| Sales settings | `GET /sales-settings`, `PUT /sales-settings` |
| Purchasing settings | `GET /purchasing-settings`, `PUT /purchasing-settings` |
| Customers | `GET/POST /customers`, `GET/PUT /customers/:id`, `GET /customers/:id/balance`, `GET /customers/:id/history`, `PUT /customers/opening-details` |
| Products | `GET/POST /products`, `GET/PUT /products/:id`, `GET/PUT /products/:id/suppliers`, `GET/POST /product-categories`, `PUT /product-categories/:id`, `GET/POST /units` |
| Invoices | `GET/POST /invoices`, `GET/PUT /invoices/:id`, plus `/submit`, `/reject`, `/approve`, `/post`, `/void`, `/reverse` |
| Receipts | `GET/POST /receipts`, `GET/PUT /receipts/:id`, plus `/submit`, `/reject`, `/approve`, `/post`, `/void`, `/reverse`, `/allocations`, and `/allocations/:allocationId/unallocate` |
| Customer returns | `GET/POST /customer-returns`, `GET/PUT /customer-returns/:id`, plus `/submit`, `/reject`, `/approve`, `/post`, `/void`, `/reverse` |
| Suppliers | `GET/POST /suppliers`, `GET/PUT /suppliers/:id`, `GET /suppliers/:id/balance`, `GET /suppliers/:id/history`, `GET /suppliers/:id/products`, `PUT /suppliers/opening-details` |
| Supplier bills | `GET/POST /bills`, `GET/PUT /bills/:id`, plus `/submit`, `/reject`, `/approve`, `/post`, `/void`, `/reverse` |
| Supplier payments | `GET/POST /supplier-payments`, `GET/PUT /supplier-payments/:id`, plus `/submit`, `/reject`, `/approve`, `/post`, `/void`, `/reverse`, `/allocations`, and `/allocations/:allocationId/unallocate` |
| Supplier returns | `GET/POST /supplier-returns`, `GET/PUT /supplier-returns/:id`, plus `/submit`, `/reject`, `/approve`, `/post`, `/void`, `/reverse` |
| Reports | `GET /reports/trial-balance`, `/profit-and-loss`, `/balance-sheet`, `/general-ledger`, `/journals`, `/receivables-aging`, `/customer-statement`, `/sales`, `/payables-aging`, `/supplier-statement`, `/purchases`, `/supplier-returns` |
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

`sourceType` is `manual` or `opening_balance`. Reversals are created only by `POST /journals/:id/reverse` with `{ "reason", "postingDate?" }`. A manual journal cannot use the receivable control account or the payable control account. An opening-balance receivable line must match `PUT /customers/opening-details` before it can be submitted. An opening-balance payable line must match `PUT /suppliers/opening-details`. Do not reverse an invoice, receipt, allocation, customer return, supplier bill, supplier payment, supplier-payment allocation, or supplier return from the journals endpoint; reverse the source document.

## Roles

`POST /roles` accepts `code`, `name`, and `permissions`. A code uses letters, digits, and underscores, up to 40 characters, and stays unique. `SmgrSale` is valid. Unknown permission codes and a grant outside the caller’s own permissions are rejected with the permission named in the error. Validation responses include `error.details.fieldErrors`. The saved role keeps every selected permission.

`PUT /users/:id` accepts the same fields as create. Omit `password` to leave the current password unchanged. Responses do not include the password hash. `GET /branches` requires `branches.view`. `GET /branches/accessible` returns the branches the signed-in user may use on a document: every branch when none are assigned, or only the assigned branches. It allows a document permission such as `invoices.create` and does not require `branches.view`.

## Sales documents

Invoice, receipt, and return bodies use the same draft, submit, approve, and post flow as journals. Amounts are decimal strings. A linked return line sends `invoiceLineId` and `quantity`. An unreferenced return also requires `customer_returns.create_unreferenced`, a reason, product, price, tax code, and return account. Posting a return locks the source invoice line and rejects a quantity or value above the remainder. Reversing an invoice fails while a posted allocation or posted return still applies. The default receipt treatment needs `customerAdvanceAccountId` on sales settings. Receivables reports return `409` when customer detail does not equal the receivable control account. Aging omits unapplied advances.

`PUT /sales-settings` includes `showCustomerTaxIdentifiers`. The default is false. When it is true at posting, the invoice stores `snapshot_tax_country_code`, `snapshot_tax_identifier`, and, only if the customer tax country is `PK`, party type, the canonical CNIC/NTN, the optional NTN check digit, and STRN. `GET /invoices/:id` returns `customerTaxIdentifiers` only while that setting is on and the snapshot has a value. Drafts return null. Later customer edits do not change the snapshot.

A customer body may include `taxCountryCode`, `taxIdentifier`, `partyType`, `cnicNtn`, and `strn`. `taxIdentifier` stays a generic value and is not copied into CNIC/NTN. When `taxCountryCode` is `PK`, party type and CNIC/NTN are required. An individual CNIC is stored as 13 digits. A company or AOP NTN is stored as 7 digits. The printed form `1234567-8` also stores check digit `8`. That digit is not verified. A save whose tax country is not `PK` does not clear party type, CNIC/NTN, the check digit, or STRN.

`POST /tax-codes` rejects an active rate above zero until `salesAccountId` is an active non-header liability, `purchaseAccountId` is an active non-header asset, or both are set. A zero rate may omit both. `PUT /tax-codes/:id` changes those two accounts only. It does not change the rate. An invoice or customer-return line uses the product tax code only when `taxCodeId` is omitted. `null` means no tax. A sent code is validated as active and effective on the document date. A sales line with a rate above zero cannot be used until its sales tax liability is mapped. A supplier bill or supplier return with a rate above zero cannot be used until its purchase tax asset is mapped.

## Purchasing documents

`PUT /purchasing-settings` sets `taxPricingMode` (`exclusive` or `inclusive`), `apControlAccountId` (an active non-header liability), optional `supplierAdvanceAccountId` (an active non-header asset, and not the payable control), and `showSupplierTaxIdentifiers`. Discount treatment stays `reduce_taxable_base`. These settings are separate from sales settings. The country code does not choose a rate.

A supplier body uses the same tax fields as a customer. When the tax country is not `PK`, party type, CNIC/NTN, the check digit, and STRN are cleared. `GET /suppliers/:id/balance` returns payables and unapplied advances. Advances are not bill aging. `PUT /products/:id/suppliers` replaces the supplier links for one product. Each link has `supplierItemCode`, `purchasePrice`, `leadTimeDays`, and `isPreferred`. One product can have one preferred supplier.

A bill line requires a product, quantity, and unit price, and may include a discount and tax code. The product must already have a purchase expense account. Posting debits that expense for the taxable base, debits the purchase tax asset for the tax, and credits the payable control for the total. It does not debit an inventory asset. Posted lines keep price, discount, tax, and account snapshots. When `showSupplierTaxIdentifiers` is on, posting also stores the supplier tax snapshot. A due date that differs from the payment terms needs `bills.override_due_date`.

A supplier payment sends `cashAccountId`, `amount`, and `allocations`. A payment whose allocations equal the amount posts as `direct_ap`: debit payable, credit cash. Any unapplied remainder requires the supplier advance asset. The whole payment then debits that asset and credits cash. Applying the advance later posts a separate journal: debit payable, credit the advance asset. That application is rejected when the payment was posted as `direct_ap`. Unallocating a direct application is rejected; reverse the payment. Unallocating a separate allocation reverses that journal. Reversing a payment that still has a separate allocation journal is rejected until those allocations are removed.

A linked supplier return line sends `billLineId`, `quantity`, and `disposition`. It uses the source line’s saved price, discount, tax, and accounts. Posting locks the bill line and rejects a quantity or value above the remainder, including other lines in the same return. Voided and reversed bills are rejected. `disposition` is `restockable`, `damaged`, or `non_restockable` and does not move warehouse quantity. An unreferenced return also requires `supplier_returns.create_unreferenced`, a reason, product, price, and purchase expense account. Posting a return debits the payable control and credits the purchase expense and purchase tax asset. Reversing a bill fails while a posted allocation or posted return still applies.

Payables aging and the supplier statement return `409` when supplier detail does not equal the payable control account. Aging uses open bills and omits unapplied advances. The purchases report is posted bills, posted supplier returns, and their reversals. The supplier-returns report is posted supplier returns and their reversals.

## Status codes

`400` validation or unbalanced journal, `401` sign-in, `403` permission, branch, or password change required, `404` missing, `409` closed period, locked currency, or a database rule.
