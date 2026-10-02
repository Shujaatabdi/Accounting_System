# Country configuration

The installation stores a country code, tax identifier, currency name and symbol, time zone, and fiscal-year start month on the company. None of these selects a built-in tax engine. `ZZ` means the country has not been set.

## Accounting profile

`accounting_profiles` keeps an effective-dated row. A change of country or compliance status on a later day closes the previous row and inserts a new one. A same-day correction updates the current row because it never applied to an earlier day. Notes-only edits update the current row.

`compliance_status` is `unverified` or `reviewed`. Reviewed means an administrator acknowledged the setup. The software does not certify tax or statutory compliance for any country. Leave the status unverified until the target country is named and a person has reviewed the chart, tax codes, and reports.

## Tax codes

Tax codes store a percentage rate, optional sales and purchase accounts, and an effective range. Overlapping active ranges for the same code are rejected. Changing a rate means retiring the current row and creating a new one. Sales invoices and customer returns calculate tax from the company tax-pricing mode and the tax code selected on the line. The country code does not choose a rate or a tax regime. Bills are not calculated yet. The software does not ship a rate for any country.

## What must not be hard-coded

Do not add a national chart, VAT return, withholding rule, or invoice layout until a country is selected and the treatment is reviewed. The starter chart of accounts is a generic setup aid. The administrator should replace it to match the company.

## Currency

One currency per installation. Foreign-currency documents, exchange rates, and revaluation are out of scope. After the first posted journal, the currency name, symbol, and decimal places are locked so historical amounts keep their meaning.
