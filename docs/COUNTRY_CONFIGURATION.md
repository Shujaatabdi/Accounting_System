# Country configuration

The installation stores a country code, tax identifier, currency name and symbol, time zone, and fiscal-year start month on the company. None of these selects a built-in tax engine. `ZZ` means the country has not been set.

## Accounting profile

`accounting_profiles` keeps an effective-dated row. A change of country or compliance status on a later day closes the previous row and inserts a new one. A same-day correction updates the current row because it never applied to an earlier day. Notes-only edits update the current row.

`compliance_status` is `unverified` or `reviewed`. Reviewed means an administrator acknowledged the setup. The software does not certify tax or statutory compliance for any country. Leave the status unverified until the target country is named and a person has reviewed the chart, tax codes, and reports.

## Tax codes

Tax codes store a percentage rate, optional sales and purchase accounts, and an effective range. Overlapping active ranges for the same code are rejected. Changing a rate means retiring the current row and creating a new one. A rate above zero needs a sales tax liability account, a purchase tax asset account, or both. Each account, when set, must be an active non-header account of that type. A zero rate may omit both. Sales invoices and customer returns calculate tax from the sales tax-pricing mode and need the sales liability when the rate is above zero. Supplier bills and supplier returns calculate tax from the purchasing tax-pricing mode and need the purchase tax asset when the rate is above zero. The country code does not choose a rate or a tax regime. The software does not ship a rate for any country.

## Customer tax identifiers

A customer may store a tax country and a generic tax identifier. Pakistan fields appear only when that customer’s tax country is `PK`: party type, CNIC/NTN, and an optional STRN. An individual CNIC is 13 digits. A company or AOP NTN is 7 digits. The printed form `1234567-8` keeps `8` as a separate check digit so the display can match the printed number. That digit is not verified. The generic tax identifier is not copied into CNIC/NTN.

`show_customer_tax_identifiers` defaults to off. When it is on, posting copies the identifiers present at that moment. Pakistan party, CNIC/NTN, check digit, and STRN are copied only when the tax country is `PK`. The invoice shows that copy only while the setting is on. The setting does not claim that any identifier is legally required. Saving a customer whose tax country is not `PK` leaves any already stored party type, CNIC/NTN, check digit, and STRN in place and does not copy them onto a new invoice. There is no FBR or IRIS connection and no stored login.

## Supplier tax identifiers

A supplier uses the same identifier format. `tax_identifier` is generic and is not copied into CNIC/NTN. Pakistan party type, CNIC/NTN, and optional STRN are stored only when the supplier tax country is `PK`. Saving a supplier whose tax country is not `PK` clears party type, CNIC/NTN, the check digit, and STRN. `show_supplier_tax_identifiers` defaults to off. When it is on, posting a bill copies the identifiers present at that moment. The bill shows that copy only while the setting is on. There is no FBR or IRIS connection and no stored login.

## Manual ATL

A customer or supplier may store one manual ATL record: status `active` or `inactive`, the check date and time, and a reference. The user and time of that entry are stored with it, and the change is audited. Clearing the record removes all of those fields together.

The record can be entered only when `company.country_code` and the party’s `tax_country_code` are both `PK`. The accounting profile, time zone, fiscal-year start month, tax identifier, and party type do not make ATL available and do not choose a tax rate. Changing the tax country so the fields are hidden leaves the stored ATL record in place. A general customer or supplier save does not write the ATL columns.

Posting an invoice or a supplier bill copies the party’s current ATL fields in the same transaction, before the document status becomes posted. `snapshot_atl_captured` is true for every document posted after this feature. A null status on that copy means the party had no ATL record. Documents posted earlier stay uncaptured, so they are not described as unknown. A trigger rejects a later change to those snapshot columns while the document is posted. The snapshot is historical only. It does not change tax, withholding, further tax, the journal, or posting eligibility.

Permissions are `customers.record_atl` and `suppliers.record_atl`. Company Admin retains both. Do not add an FBR or IRIS connection or a place to store login credentials.

## Phase 6 boundaries

Manual ATL recording is implemented. Statutory reports and business-specific workflows are not. Do not add an FBR or IRIS connection or a place to store login credentials.

A country code, time zone, fiscal-year start month, customer or supplier identifier, party type, or product type must not automatically select tax rules. `compliance_status` `reviewed` means an administrator acknowledged the setup. It does not store a statutory rule set and it does not certify a country.

No statutory report is specified. Do not add one until the report, its lines, and its source accounts or documents are named, and until the company filing calendar and currency are confirmed. Existing financial, sales, purchases, and aging reports are management reports.

No business-specific workflow is specified. Name the business type and the behavior that should differ before adding one.

## What must not be hard-coded

Do not add a national chart, tax return, withholding rule, or invoice layout from a country code. A statutory treatment needs the explicit specification above. The starter chart of accounts is a generic setup aid. The administrator should replace it to match the company.

## Currency

One currency per installation. Foreign-currency documents, exchange rates, and revaluation are out of scope. After the first posted journal, the currency name, symbol, and decimal places are locked so historical amounts keep their meaning.
