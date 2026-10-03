# Country configuration

The installation stores a country code, tax identifier, currency name and symbol, time zone, and fiscal-year start month on the company. None of these selects a built-in tax engine. `ZZ` means the country has not been set.

## Accounting profile

`accounting_profiles` keeps an effective-dated row. A change of country or compliance status on a later day closes the previous row and inserts a new one. A same-day correction updates the current row because it never applied to an earlier day. Notes-only edits update the current row.

`compliance_status` is `unverified` or `reviewed`. Reviewed means an administrator acknowledged the setup. The software does not certify tax or statutory compliance for any country. Leave the status unverified until the target country is named and a person has reviewed the chart, tax codes, and reports.

## Tax codes

Tax codes store a percentage rate, optional sales and purchase accounts, and an effective range. Overlapping active ranges for the same code are rejected. Changing a rate means retiring the current row and creating a new one. A rate above zero cannot be saved as active, or used on an invoice or return, until its sales account is an active liability account that is not a header. A zero rate may have no sales account. Sales invoices and customer returns calculate tax from the company tax-pricing mode and the tax code selected on the line. The country code does not choose a rate or a tax regime. Bills are not calculated yet. The software does not ship a rate for any country.

## Customer tax identifiers

A customer may store a tax country and a generic tax identifier. Pakistan fields appear only when that customer’s tax country is `PK`: party type, CNIC/NTN, and an optional STRN. An individual CNIC is 13 digits. A company or AOP NTN is 7 digits. The printed form `1234567-8` keeps `8` as a separate check digit so the display can match the printed number. That digit is not verified. The generic tax identifier is not copied into CNIC/NTN.

`show_customer_tax_identifiers` defaults to off. When it is on, posting copies the identifiers present at that moment. Pakistan party, CNIC/NTN, check digit, and STRN are copied only when the tax country is `PK`. The invoice shows that copy only while the setting is on. The setting does not claim that any identifier is legally required. ATL status and FBR/IRIS connections are not stored.

## What must not be hard-coded

Do not add a national chart, VAT return, withholding rule, or invoice layout until a country is selected and the treatment is reviewed. The starter chart of accounts is a generic setup aid. The administrator should replace it to match the company.

## Currency

One currency per installation. Foreign-currency documents, exchange rates, and revaluation are out of scope. After the first posted journal, the currency name, symbol, and decimal places are locked so historical amounts keep their meaning.
