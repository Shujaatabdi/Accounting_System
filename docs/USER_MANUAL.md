# Accounting System user manual

Version 1.0 · 3 October 2026

This manual is for company administrators and staff who use the installed Accounting System. It describes the screens that are in the application now. Examples are fictional and are marked **Example**. They are not your company data.

One installation keeps the books for one company. The country code does not choose a tax system, and this software does not certify that any country’s tax rules are being followed.

## Contents

1. Before you begin
2. How to sign in
3. How work moves from a draft to the books
4. Rules that apply across the system
5. Overview
6. Setup
7. Access
8. Ledger
9. Sales
10. Purchasing
11. Reports
12. What the screens do not offer yet
13. Glossary

## 1. Before you begin

A company administrator usually completes setup before staff enter day-to-day sales or purchasing. Do these in order.

1. Sign in and, if asked, change the password.
2. Open **Company** and replace any placeholder legal name and country code. Use a two-letter country code. Set the time zone to a real time-zone name, such as **Example:** `America/Toronto`.
3. Open **Country profile** and record the country you are working in. Leave **Compliance** as **Unverified** until a person has reviewed the setup. Reviewed means an administrator acknowledged the setup. It is not a certificate from this software.
4. Open **Chart of accounts** and confirm the accounts you will use for cash, receivables, payables, sales, purchase expenses, sales tax, purchase tax, and advances. This version does not create those accounts for you.
5. Open **Fiscal periods** and make sure the year and month you will post into are **open**.
6. Open **Tax codes** if you will use a named rate. A rate above zero needs a sales tax liability, a purchase tax asset, or both. An invoice uses the sales liability. A supplier bill uses the purchase tax asset. The country code does not choose the rate.
7. Open **Sales settings**. Choose the receivable control account. If unapplied receipts should sit as a customer advance, also choose a liability account called **Customer advances**. Until that account is chosen, the default receipt treatment will not save a receipt.
8. Open **Purchasing settings**. Confirm the payable control account. Leave **Supplier advances** empty until you have an asset account for money paid before it is applied to a bill. A payment that is not fully applied stays blocked until that asset is selected.
9. Open **Users** and **Roles** if other people will sign in.
10. Open **Branches** if you need more than the starting branch. Invoices, receipts, returns, bills, supplier payments, and supplier returns ask for a branch.

Drafts do not appear on official reports. Only **posted** activity does.

## 2. How to sign in

The sign-in page is at `/login`. The top bar later shows **Sign out**.

| Label | Required | What to enter | Example |
| --- | --- | --- | --- |
| Email | Yes | The person’s sign-in email. | Example: `amina.khan@northwind.example` |
| Password | Yes | The password issued for that person. | Do not write a real password in this manual. |
| Sign in | Button | Opens the dashboard, or the change-password page if a new password is required. | — |

### Change password

Route: `/account/password`. The page title is **Change password**.

The page says to use at least 10 characters with a letter and a number. The application enforces that rule.

| Label | Required | What to enter | Example |
| --- | --- | --- | --- |
| Current password | Yes | The password you use now. | — |
| New password | Yes | 10 to 200 characters, including a letter and a number. | Example shape only: a phrase plus a number. |
| Save password | Button | Saves the new password and opens the dashboard. | — |

## 3. How work moves from a draft to the books

Journals, invoices, receipts, and customer returns use the same idea.

| Status you may see | What it means | Does it change the books? |
| --- | --- | --- |
| draft | Saved, still editable where the screen allows an edit. | No |
| pending_approval | A journal has been submitted and is waiting for approval. The button you press is **Submit**. | No |
| submitted | An invoice, receipt, or return has been submitted. | No |
| approved | A person with approval permission accepted it. | No |
| posted | It is in the ledger. Reports can include it. | Yes |
| rejected | Returned for correction. On journals, reject puts the entry back to draft. | No |
| void | Cancelled before it was posted. | No |
| reversed | A posted item was corrected by a reversing entry. The original stays in history. | The reversal posts the opposite amounts. |

**Submit** sends the document for approval. It does not post it.

**Approve** accepts a submitted document. If **Company** has **Require a different person to approve a journal** turned on, the approver must be a different person. That same company setting is also checked for invoices, receipts, and customer returns, even though the checkbox text mentions journals.

**Post** writes the accounting entry. Posting is allowed only when the fiscal year and the fiscal period for the posting date are open.

**Void** cancels a document that is not yet posted. It is not a way to undo a posted document.

**Reverse** creates a new posted entry that swaps the amounts. Use it to correct something already posted. You cannot silently edit or delete a posted journal, invoice, receipt, or return.

**Reject** is available on a journal that is waiting for approval. It needs a reason of at least 3 characters. The journal screen fills **Returned to draft** if you leave the reason blank. Invoice, receipt, and return screens do not show a Reject button.

**Reopen** on a fiscal period allows posting into that month again. Reopening a year does not reopen its months. You must reopen each period you need.

**Export CSV** downloads a spreadsheet of the report on screen. It appears only after you run the report, and only if your role includes report export. **Print / PDF** uses the browser print window.

## 4. Rules that apply across the system

- One installation is one company. There is no switch for a second company.
- There is one company currency. After the first journal is posted, **Currency name**, **Currency symbol**, and **Decimal places** cannot be changed.
- The country code is two letters, such as **Example:** `CA`. It does not select tax rates or tax rules.
- Amounts are typed as decimal numbers, such as **Example:** `100.00`. Do not use a thousands separator.
- Dates use the calendar date you pick. Official reports filter by **posting date**, not by the transaction date, except where a screen says otherwise.
- A **control account** is a summary account, such as accounts receivable or accounts payable. Ordinary manual journals cannot post to the customer receivable control account or the supplier payable control account. Customer documents post to the receivable. Supplier bills, payments, allocations, and returns post to the payable.
- Customer opening amounts can be attached to an opening-balance receivable line, and supplier opening amounts can be attached to an opening-balance payable line. There is no screen for either. See section 12.
- Unapplied receipt cash uses a customer-advance liability account unless **Sales settings** says to credit accounts receivable instead. Unapplied advances are not included in receivables aging.
- Unapplied supplier payments use a supplier-advance asset account. Until that account is selected, a payment that is not fully applied to bills cannot be posted. Unapplied supplier advances are not included in payables aging.
- A linked customer return names one invoice line. A linked supplier return names one bill line. The quantity and value cannot exceed what is still open on that line. Neither return changes stock quantity, stock value, or cost of goods sold.
- An invoice cannot be reversed while a posted receipt is still allocated to it or a posted return still applies. A supplier bill cannot be reversed while a posted payment is still allocated to it or a posted supplier return still applies. Remove those documents first.
- The menu hides an item when your role does not include that permission. Hiding a button is not the only check. The system also refuses the action if you do not have permission.
- The **Company Admin** role can perform every action and can see every branch.
- Other users can be limited to selected branches. The user screen does not yet let you assign those branches. See section 12.
- Important actions are written to the **Audit log** in the same step as the change. The log keeps the previous and new values.

## 5. Overview

### Dashboard

Menu: **Dashboard**. Route: `/dashboard`.

**Purpose.** A short snapshot of the company after you sign in.

**Who uses it.** Anyone who can sign in. Some cards stay hidden without the matching permission.

**How to open it.** It is the first item under **Overview**, or the page after sign-in.

There is no data-entry form. The page shows:

| What you see | Meaning |
| --- | --- |
| Company display name | The heading. It comes from **Company**. |
| Time zone | The company time zone. The trial-balance date on this page uses “today” in that zone. |
| Warning banner | Shown while the legal name is still the placeholder or the country code is still `ZZ`. Set them on **Company** before you rely on the books. The banner also says country tax rules are not verified. |
| Open periods | How many fiscal periods are open. Shown when you can view fiscal periods. Otherwise the card says **Hidden**. |
| Unposted journals | How many journals are draft, waiting for approval, or approved but not posted. Shown when you can view journals. Otherwise **Hidden**. |
| Trial balance | Debits and credits as of today, and whether they match. Shown when you can view reports. Otherwise the card says **Report permission is required**. |

This trial balance includes posted journals only.

## 6. Setup

### Company

Menu: **Company**. Route: `/company`. Permission to view: `company.view`. Permission to save: `company.update`.

**Purpose.** The legal identity of this installation, its currency, its year start, and whether approval must be done by a second person.

**Who uses it.** A company administrator.

**Prerequisite.** Sign in. Save this before you treat the books as live.

The page title is **Company**. The introduction says one installation has one company and one currency, and that currency name, symbol, and decimal places lock after the first posted journal.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Legal name | Yes | 1 to 200 characters. Do not leave the placeholder “Company name not set”. | Example: `Northwind Studio Ltd` | Printed identity of the company. |
| Display name | Yes | 1 to 200 characters. | Example: `Northwind Studio` | Shown on the dashboard heading. |
| Country code | Yes | Exactly two letters. | Example: `CA` | Identifies the country. It does not select tax rules. |
| Tax identifier | Optional | Up to 80 characters. Blank is allowed. | Example: `TAX-100200300` | Stored on the company. It is not checked against a government register. |
| Time zone | Yes | A time-zone name the system recognizes, up to 80 characters. | Example: `America/Toronto` | Used for “today” on the dashboard. |
| Currency name | Yes | 1 to 40 characters. Locked after the first posted journal. | Example: `Dollar` | The name of the single company currency. |
| Currency symbol | Yes | 1 to 8 characters. Locked after the first posted journal. | Example: `$` | Shown with dashboard amounts. |
| Decimal places | Yes | Whole number from 0 to 4. The box starts from the saved company value. Locked after the first posted journal. | Example: `2` | How money is rounded. |
| Fiscal year start month | Yes | Whole number from 1 to 12. 1 means January. | Example: `1` | New fiscal years must start in this month, on day 01. |
| Logo URL | Optional | Up to 500 characters. The screen does not display the picture. | Example: `https://example.com/logo.png` | Stored only. |
| Notes | Optional | Up to 2000 characters. | Example: `Books kept for the studio only.` | Stored on the company. |
| Require a different person to approve a journal | Optional checkbox | On or off. | Leave off for a one-person office. | When on, the person who submits cannot approve that journal. The same rule is applied to invoices, receipts, customer returns, supplier bills, supplier payments, and supplier returns. |
| Save company | Button | — | — | Saves the profile. It does not post a journal. |

If the name or country is still a placeholder, a yellow banner asks you to replace them and to use the ISO country code rather than a tax regime.

#### Addresses

Press **Add address**. The first address is stored as the primary address. The screen does not show a primary checkbox, a second address line, a region, or a postal code. Those values are not editable here.

| Label | Required | Allowed values | Example |
| --- | --- | --- | --- |
| Type | Yes | Registered, Billing, or Other. | Example: `Registered` |
| Line 1 | Yes, if you add an address | 1 to 160 characters. | Example: `100 Harbor Street` |
| City | Optional | Up to 80 characters. | Example: `Halifax` |
| Country | Yes, if you add an address | Exactly two letters. | Example: `CA` |

#### Contacts

Press **Add contact**. The screen does not show a job title or a primary checkbox. The first contact is stored as primary.

| Label | Required | Allowed values | Example |
| --- | --- | --- | --- |
| Name | Yes, if you add a contact | 1 to 160 characters. | Example: `Amina Khan` |
| Phone | Optional | Up to 40 characters. | Example: `+1 555 0100` |
| Email | Optional | Must be a valid email if you type one. A blank box is allowed. | Example: `amina.khan@northwind.example` |

### Country profile

Menu: **Country profile**. Route: `/settings/accounting-profile`. View permission: `accounting_profile.view`. Save permission: `accounting_profile.update`.

**Purpose.** Record which country this installation is set up for, and whether an administrator has reviewed that setup.

**Who uses it.** A company administrator.

The page title is **Country profile**. The introduction states that country tax and statutory rules stay unverified until a reviewer marks them reviewed for a named country.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Country code | Yes | Exactly two letters. | Example: `CA` | Does not select tax rates. |
| Name | Yes | 1 to 120 characters. | Example: `Canada profile, not a tax engine` | A name for this profile row. |
| Compliance | Yes | **Unverified** or **Reviewed by administrator**. | Leave **Unverified** until a person has reviewed the chart, tax codes, and reports. | Reviewed is an acknowledgement. It is not a certification. |
| Notes | Optional | Up to 2000 characters. | Example: `Reviewed the chart names only. Tax rates are not verified.` | Stored with the profile. |
| Save profile | Button | — | — | Saves the profile. A later change of country or compliance on a new day keeps history. |

**History** lists older profile rows as date, country code, and status. There are no buttons on those rows.

### Tax codes

Menu: **Tax codes**. Route: `/settings/tax-codes`. View permission: `tax_codes.view`. Add permission: `tax_codes.manage`.

**Purpose.** Store a named percentage rate, the date it starts, the sales tax liability used on invoices, and the purchase tax asset used on supplier bills.

**Who uses it.** A company administrator.

The page title is **Tax codes**. A rate above zero needs a sales tax liability, a purchase tax asset, or both. Each account must be active and must not be a header. A rate change is a new code. No country rate is verified. Adding or mapping a code does not change documents that are already saved.

| Control | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Code | Yes | 1 to 32 characters. Placeholder **Code**. | Example: `STD` | The short name of the rate. |
| Name | Yes | 1 to 160 characters. Placeholder **Name**. | Example: `Standard rate` | A description for staff. |
| Rate % | Yes | A percentage from 0 to 100, as a decimal number. Placeholder **Rate %**. The box starts at `0`. | Example: `10` | The rate stored for that code. No country rate is built in. |
| Sales tax account | Required for a sales line when the rate is above zero | Active liability accounts that are not headers, or **No sales tax account**. | Example: `2200 Tax payable` | The account credited for tax on an invoice that uses this code. Invoice users do not choose this account. |
| Purchase tax account | Required for a supplier bill when the rate is above zero | Active asset accounts that are not headers, or **No purchase tax account**. | Example: an input-tax asset you already created | The account debited for tax on a supplier bill that uses this code. Bill users do not choose this account. |
| Date box | Yes | A calendar date. There is no label. It starts as today’s date. | Example: `2026-01-01` | The first day this version of the rate is effective. |
| Add tax code | Button | — | — | Adds the code. It does not post a journal. A rate above zero is rejected until at least one of the two tax accounts is selected. |

The list headings are **Code**, **Name**, **Rate**, **Starts**, **Status**, **Sales tax account**, and **Purchase tax account**. Choosing an account on an existing row saves both accounts without changing the rate. A zero-rate code may have no account. There is still no retire button on this screen.

### Numbering

Menu: **Numbering**. Route: `/settings/numbering`. View permission: `numbering.view`. Save permission: `numbering.update`.

**Purpose.** Set the prefix and the next number for journals, invoices, receipts, customer returns, supplier bills, supplier payments, and supplier returns.

**Who uses it.** A company administrator.

The page title is **Document numbering**. Each document type is its own row. The three boxes have no labels. From left to right they are prefix, next number, and padding. **Save** applies to that row. The confirmation says issued numbers are not rewritten.

| Position | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Document type | Shown, not editable | `journal`, `invoice`, `receipt`, `customer_return`, `bill`, `supplier_payment`, or `supplier_return`. | `bill` | Which sequence you are editing. |
| Prefix | Can be blank | Up to 12 characters. | Example: `INV-` | Text placed before the number. |
| Next number | Yes | A whole number of at least 1. | Example: `1` | The next document receives this number. Already issued numbers stay as they are. |
| Pad length | Yes | A whole number from 1 to 12. | Example: `5` | `1` with padding 5 is shown as `00001`. |
| Save | Button | — | — | Saves that sequence only. |

Example result: prefix `INV-`, next number `1`, padding `5` produces a number shaped like `INV-00001`.

### Sales settings

Menu: **Sales settings**. Route: `/settings/sales`. Uses the country-profile permissions: view `accounting_profile.view`, save `accounting_profile.update`.

**Purpose.** Tell the system how to price tax, where unapplied customer money goes, and which accounts are the receivable control and the customer-advance liability.

**Who uses it.** A company administrator, before invoices and receipts are posted.

| Label | Required | Options and limits | Example | Effect |
| --- | --- | --- | --- | --- |
| Tax pricing | Yes | **Tax exclusive** or **Tax inclusive**. The stored default is exclusive. | Example: `Tax exclusive` | Used when an invoice or return includes a tax code. Exclusive adds tax on top. Inclusive treats the price as already including tax. |
| Unapplied receipts | Yes | **Customer advance liability** or **Credit accounts receivable**. The stored default is the advance liability. | Example: `Customer advance liability` | Advance: the receipt credits a liability until you allocate it. Credit accounts receivable: the whole receipt reduces receivables immediately, and allocation only marks which invoice it pays. |
| Receivable control | Yes | A list of asset accounts that can be posted to. | Example: the accounts-receivable account from your chart. | Invoices debit this account. Receipt allocations and returns credit it. Manual journals cannot use it. |
| Customer advances | Required only for the advance treatment | Liability accounts, or **Not selected**. | Example: an account named `Customer advances`. | Receipts that use the advance treatment cannot be saved until this is selected. |
| Show customer tax identifiers | Yes | **Off** or **On**. The stored default is Off. | Example: `Off` | When On, posting an invoice copies the customer tax details that exist at that moment. Later customer edits do not change that copy. Turning it Off hides the details on posted invoices and keeps the copy. Turning it On again shows the original copy. Invoices posted while it was Off do not gain details later. These details are not claimed to be legally required. |
| Line discounts use the stored rule | Text, not an input | The only stored rule is `reduce_taxable_base`. | — | A line discount reduces the amount tax is calculated on. The invoice screen has a discount box. |
| Save sales settings | Button | — | — | Saves the settings and writes an audit entry. It does not post a journal. |

### Purchasing settings

Menu: **Purchasing settings**. Route: `/settings/purchasing`. Uses the same permissions as sales settings: view `accounting_profile.view`, save `accounting_profile.update`.

**Purpose.** Tell the system how to price purchase tax, which liability is the payable control, and which asset holds supplier payments that are not yet applied to bills.

**Who uses it.** A company administrator, before supplier bills and payments are posted.

These settings are separate from **Sales settings**. The country code does not choose a tax rate.

| Label | Required | Options and limits | Example | Effect |
| --- | --- | --- | --- | --- |
| Tax pricing | Yes | **Tax exclusive** or **Tax inclusive**. The stored default is exclusive. | Example: `Tax exclusive` | Used when a supplier bill or supplier return includes a tax code. |
| Payable control | Yes | Liability accounts that can be posted to. | Example: `2100 Accounts payable`, when that starter account is still in the chart. | Bills credit this account. Payments, allocations, and returns debit it. Manual journals cannot use it. |
| Supplier advances | Optional | Asset accounts, or **Not selected**. | Example: an asset you already created, such as `Supplier advances`. | Required before you can post a payment that is not fully applied to bills. It cannot be the payable control account. The system does not create this account. |
| Show supplier tax identifiers | Yes | **Off** or **On**. The stored default is Off. | Example: `Off` | When On, posting a bill copies the supplier tax details that exist at that moment. Later supplier edits do not change that copy. These details are not claimed to be legally required. |
| Discount treatment | Text, not an input | The only stored rule is `reduce_taxable_base`. | — | A line discount reduces the amount tax is calculated on. |
| Save | Button | — | — | Saves the settings and writes an audit entry. It does not post a journal. |

### Branches

Menu: **Branches**. Route: `/branches`. View permission: `branches.view`. Add permission: `branches.create`.

**Purpose.** Locations used on invoices, receipts, returns, supplier bills, supplier payments, and supplier returns. Users can later be limited to certain branches. Company Admin always sees every branch.

**Who uses it.** A company administrator.

There is no search box. The list loads up to 100 branches.

| Control | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Code | Yes | 1 to 32 characters. Placeholder **Code**. | Example: `MAIN` | Short unique code. |
| Name | Yes | 1 to 160 characters. Placeholder **Name**. | Example: `Main studio` | The name staff see. |
| Add branch | Button | — | — | Creates an active branch. The screen always marks it active. It does not ask for a city or country. |

The table has no headings. Columns are code, name, and **Active** or **Inactive**. There is no edit button. City, address, and country can be stored by the system, but this screen does not show them.

### Fiscal periods

Menu: **Fiscal periods**. Route: `/periods`. View permission: `periods.view`. Create, close, and reopen permissions are `periods.manage`.

**Purpose.** Define the year and the months in which posting is allowed.

**Who uses it.** A company administrator.

Posting works only in an open period of an open year. Closing a year also closes its periods. Reopening a year does not reopen those periods.

| Control | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Date box | Yes | A calendar date. No label. It must be day 01, and the month must match **Fiscal year start month** on Company. | Example: `2026-01-01` when the company year starts in month 1. | Creates twelve monthly periods. |
| Create year | Button | — | — | Creates an open year and open months. It does not post a journal. |

Each year card shows the year name, a status badge (`open` or `closed`), the start and end dates, and either **Close year** or **Reopen year**.

The period table has no headings. Columns are:

| Column | Meaning |
| --- | --- |
| First | Period name, in the form year-month, such as `2026-01`. |
| Second | Start date. |
| Third | End date. |
| Fourth | `open` or `closed`. |
| Close or Reopen | Closes an open period, or reopens a closed one. Reopen the year first if the year is closed. |

**Close year**, **Reopen year**, **Close**, and **Reopen** ask **Reason for this period change**. Type at least 3 characters. Cancel, or a shorter reason, does nothing. Closing a period does not delete drafts. If unposted journals use dates in that period, the page reports how many.

## 7. Access

### Users

Menu: **Users**. Route: `/users`. View permission: `users.view`. Create permission: `users.create`. Update permission: `users.update`.

**Purpose.** Add people who can sign in, and give them roles and branch access.

**Who uses it.** A company administrator, or someone whose role includes the matching user permission.

Press **Edit** on a user to change the name, email, active status, roles, and branches. The password box is blank. Leave it blank to keep the current password. The page never shows the stored password. **Create user** is shown for `users.create`. **Edit** is shown for `users.update`.

Leave every branch unticked to allow every branch. Tick branches to limit that person to those locations. Changing branch access on this page requires `branches.view`.

There is no search box. Up to 100 users are listed.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Name | Yes | 1 to 160 characters. | Example: `Amina Khan` | The name in the top bar and on the user list. |
| Email | Yes | A valid email. | Example: `amina.khan@northwind.example` | The sign-in name. |
| Password / New password | Required for a new user | 10 to 200 characters, with a letter and a number. Leave blank when editing. | Do not store the real password in a document. | A new password replaces the old one. A blank edit leaves it unchanged. |
| Active | On edit | Ticked or clear. | Clear the box to deactivate. | An inactive user cannot sign in. |
| Role checkboxes | Optional | One checkbox per role. The label is the role name. | Example: tick `Sales form` for a sales manager. | The role supplies permissions. A user cannot be given a permission the editor does not have. |
| Branch checkboxes | Optional | One checkbox per branch. | Tick one branch. | Limits documents to those branches. None ticked means every branch. |
| Create user / Save user | Button | — | — | Creates the user, or saves the user you are editing. It does not post a journal. |

The table columns are **Name**, **Email**, **Roles**, and **Status** (`Active` or `Inactive`). A rejected save names the field or the permission.

### Roles

Menu: **Roles**. Route: `/roles`. View permission: `roles.view`. Create permission: `roles.create`. Update permission: `roles.update`.

**Purpose.** Create a named set of permissions for staff who should not have full access.

**Who uses it.** A company administrator.

The **Company Admin** role always has every permission. The screen says a system role’s permissions stay complete. Press **Edit** on another role to load its saved permissions into the form. The code cannot be changed after the role is created.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Code | Yes | Letters, digits, and underscores, up to 40 characters. Uppercase is allowed. | Example: `SmgrSale` | The short id of the role. It must be unique. |
| Name | Yes | 1 to 80 characters. | Example: `Manager Sales` | The name shown when you assign the role to a user. |
| Select all permissions | Button | — | — | Ticks every permission in the catalog. |
| Clear all | Button | — | — | Clears every tick. |
| Group checkbox | Optional | One checkbox per group, such as **Select all Sales permissions**. | Tick **Sales** | Ticks or clears every permission in that group. A dash means only some permissions in the group are ticked. |
| Permission checkboxes | Optional | Grouped by Setup, Access, Ledger, Sales, Purchasing, and Reports. The label is the plain description. The code is shown beside it. | Tick `Post sales invoices` (`invoices.post`) | Each ticked code is granted. Saving does not drop a ticked permission. |
| Create role / Save role | Button | — | — | Creates the role, or saves the role you are editing. |

If the code or a permission is rejected, the page names the field or the permission. A person who is not Company Admin cannot grant a permission they do not hold.

Existing roles are listed with the name, the code, and either “System role. Permissions stay complete.” or the permission codes.

Permission codes you can tick are the actions in the system. The words before the dot are the area. The word after the dot is the action: view, create, update, submit, approve, post, void, reverse, and a few specials.

Special codes:

| Code | Plain meaning |
| --- | --- |
| invoices.override_due_date | Allow a due date that is not invoice date plus the customer’s payment terms. The invoice screen does not offer this. |
| invoices.override_credit_limit | Allow posting an invoice above the customer’s credit limit. The invoice screen does not offer this. |
| customer_returns.create_unreferenced | Allow a return that is not tied to an invoice line. The return screen does not offer this. |
| reports.export | Show **Export CSV** on reports. |

### Audit log

Menu: **Audit log**. Route: `/audit`. Permission: `audit.view`.

**Purpose.** See who changed important records, and the values before and after the change.

**Who uses it.** An administrator or an auditor.

There are no filters on the screen. The page loads the latest 50 events.

Each row is a collapsed line: date and time, action code, and a short summary. Open it to see the before and after values. There are no column headings and no export button on this screen.

The log includes sign-in password changes, company and sales settings, user and role changes, account changes, period open and close, journal submit, approve, post, void, and reverse, and the same style of actions for customers, products, invoices, receipts, and returns. A posted document is not edited in place. The log shows the reversal as its own event.

## 8. Ledger

### Chart of accounts

Menu: **Chart of accounts**. Route: `/accounts`. View permission: `accounts.view`. Add permission: `accounts.create`.

**Purpose.** The list of accounts journals can use. A header account is a grouping account and cannot receive amounts. An inactive account cannot receive amounts.

**Who uses it.** A company administrator.

The introduction says the starter chart is generic, not a statutory template. There is no search box. Up to 100 accounts are listed. Subtype, description, and an active checkbox exist in the saved account but are not shown on the form. New accounts are saved as active.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Code | Yes | 1 to 32 characters. Must be unique. | Example: `2300` | The account number staff see. |
| Name | Yes | 1 to 160 characters. | Example: `Customer advances` | The account name. |
| Type | Yes | asset, liability, equity, income, or expense. | Example: `liability` | Sets the normal side. Assets and expenses are debit-normal. Liabilities, equity, and income are credit-normal. |
| Parent | Optional | **None**, or a header account of the same type. | Example: a header named `Liabilities` | Places the account under that header. |
| Header | Optional checkbox | On means this account only groups other accounts. | Leave off for an account you will post to. | Header accounts cannot be used on a journal line. |
| Control account | Optional checkbox | On marks it as a control account. | Leave off unless this account summarizes a subledger. | The receivable control used by sales is chosen on **Sales settings**, not by this checkbox alone. |
| Add account | Button | — | — | Adds the account. It does not post a balance. |

Table columns: **Code**, **Name**, **Type**, **Normal** (`debit` or `credit`), and **Status**. Status can include Header, Active, Inactive, System, and Control. There is no edit or delete button on the screen. A system account is part of the starter chart.

### Journals

Menu: **Journals**. Route: `/journals`. View permission: `journals.view`.

**Purpose.** Record a balanced set of debits and credits that are not created automatically by an invoice, receipt, or return.

**Who uses it.** Someone who can create journals. A second person may approve them.

The list shows up to 50 journals and has no search or status filter, even though those filters exist behind the scenes. The page says the list uses the transaction date, while reports use the posting date.

**New journal** opens `/journals/new`.

| Column | Meaning |
| --- | --- |
| Number | The journal number. Select it to open the journal. |
| Transaction date | The date typed on the journal. |
| Posting date | The date used on reports. A dash means it is not posted. |
| Description | The text entered on the journal. |
| Status | draft, pending_approval, approved, posted, or void. A posted journal that has been reversed also says **reversed**. |
| Debit | The total debit. Credits are equal when the journal is ready to submit. |

#### New journal and Edit draft

Edit is available only while the status is draft, at `/journals/{id}/edit`.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Transaction date | Yes | A calendar date. Starts as today. | Example: `2026-01-15` | The document date. It is not the report date until you post. |
| Source | Yes | **Manual** or **Opening balance**. | Example: `Manual` | Manual cannot use the receivable control account. Opening balance can, but only when customer amounts match that line. There is no screen to enter those customer amounts. |
| Description | Yes | 1 to 500 characters. | Example: `Owner cash introduced` | Shown on the journal list. |
| Reference | Optional | Up to 80 characters. | Example: `DEP-100` | A cross-reference. It does not have to be unique. |
| Account | Required on each line you keep | A postable account. The first choice is **Select**. Lines left on Select are dropped when you save. | Example: `1110 Cash on hand` | The account to debit or credit. Headers and inactive accounts are not in the list. |
| Description | Optional on the line | Up to 300 characters. | Example: `Cash counted` | Extra text for that line. |
| Debit | One side of the line | A decimal number, or blank. Do not put an amount on both Debit and Credit. Do not leave both at zero. | Example: `100.00` | Increases a debit-normal account, such as cash. |
| Credit | One side of the line | Same rules as Debit. | Example: `100.00` | Increases a credit-normal account, such as equity. |
| Add line | Button | — | — | Adds another blank line. At least two lines are required before submit. |
| Debit total and Credit total | Display | Shown under the lines. | They must match before submit. | Saving a draft is allowed before they match. Submit, approve, and post are not. |
| Save draft | Button | — | — | Saves without posting. |

The form does not ask for a branch. A manual journal that uses the receivable control account is rejected.

#### Journal detail

Route: `/journals/{id}`.

You see the number, description, transaction date, posting date or “not posted”, source, and the lines: account, description, debit, and credit. Totals are shown under the table.

| Control | When it appears | What it does |
| --- | --- | --- |
| Edit | Draft only | Opens the draft form. |
| Submit | Draft, if you have `journals.submit` | Moves the journal to pending_approval. It must balance, and an opening receivable line must already match customer detail. |
| Approve | Pending approval, if you have `journals.approve` | Moves it to approved. Does not post. |
| Reject | Pending approval, if you have `journals.approve` | Returns it to draft. Uses the Reason box, or “Returned to draft” if that box is empty. The reason must be at least 3 characters. |
| Date box | Approved, next to Post. No label. | The posting date. It starts as the transaction date. The period for this date must be open. |
| Post | Approved, if you have `journals.post` | Posts the journal. From this moment it is in the reports and cannot be edited. |
| Reverse | Posted and not already reversed, if you have `journals.reverse` | Posts an opposite journal. You must type a reason of at least 3 characters. Do not use this on a journal that came from an invoice, receipt, allocation, or customer return. Reverse that document instead. The button is still shown; the system rejects the action. |
| Void | Draft, pending approval, or approved, if you have `journals.void` | Cancels it before posting. Uses the Reason box, or “Voided before posting”. |
| Reason | Always on this card | Placeholder **Reason**. Used by Reject, Void, and Reverse. |

A banner links to the reversing entry when one exists.

## 9. Sales

### Customers

Menu: **Customers**. Route: `/customers`. View permission: `customers.view`. Create permission: `customers.create`.

**Purpose.** Keep the people or businesses you invoice.

**Who uses it.** Sales staff who can create customers, and anyone who needs the customer list.

The page says customer balances are subledger detail and do not create a second receivable posting, and that a tax country does not choose a tax rate. There is no balance button, no history button, and no search box on this screen. Up to 100 customers are listed. Click a row to edit that customer. Saving an edit keeps addresses and contacts that were already stored. The form does not ask for a phone, email, address, or notes. A new customer is saved as active.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Code | Yes | 1 to 32 characters. Must be unique. | Example: `C001` | The short customer code. |
| Legal name | Yes | 1 to 160 characters. | Example: `Harbor Supplies Ltd` | The legal name. |
| Display name | Yes | 1 to 160 characters. | Example: `Harbor Supplies` | Shown on invoices, receipts, returns, and reports. |
| Payment terms (days) | Yes | A whole number from 0 to 3650. The box starts at `30`. | Example: `30` | Due date on a new invoice is the invoice date plus these days, unless a permitted user overrides it. The invoice screen does not show an override. |
| Credit limit | Optional | A decimal number of zero or more, or blank. The placeholder says blank means no limit. | Example: `5000.00` | When posting an invoice, the system compares what the customer already owes, minus applicable advances, plus the new invoice. Blank means no check. The invoice screen cannot override a block. |
| Tax country | Optional | Two letters, or blank. | Example: `PK` | The customer’s own tax country. It does not choose a tax rate. Pakistan fields appear only when this is `PK`. Changing it away from `PK` hides those fields and does not delete values already stored. |
| Tax identifier | Optional | Up to 60 characters. | Example: `generic-tax-id` | A generic identifier. It is not treated as a CNIC or NTN, and the system does not guess a party type from it. |
| Party type | Required when tax country is `PK` | **Individual**, **Company**, or **AOP**. | Example: `Company` | Hidden unless the tax country is `PK`. |
| CNIC/NTN | Required when tax country is `PK` | Individual: 13 digits. Spaces and hyphens are ignored. Company or AOP: 7 digits, or 7 digits, a hyphen, and one check digit. | Example: `35202-1234567-1` for an individual. Example: `1234567` or `1234567-8` for a company or AOP. | The stored CNIC is the 13 digits. The stored NTN is the 7 digits. The check digit in `1234567-8` is stored separately so the printed form can be shown. It is not counted as part of the seven-digit NTN, and it is not verified. Eight digits without a hyphen, such as `12345678`, are rejected. |
| STRN | Optional when tax country is `PK` | Up to 60 characters. No format is required. | Example: `12-34-5678-901-23` | Stored as text. Hidden unless the tax country is `PK`. |
| Add customer / Save customer | Button | — | — | Saves the customer. It does not post a balance. **Cancel** appears while you are editing. |

Table columns: **Code**, **Name**, **Tax country**, **CNIC/NTN** (the printed form when a check digit is stored), **Terms**, **Credit limit**, and **Status**. Click a row to edit it.

### Products

Menu: **Products**. Route: `/products`. View permission: `products.view`. Create permission: `products.create`.

**Purpose.** The catalog of things you sell or buy. Stock, non-stock, and service are labels. This version does not keep a quantity on hand, a stock value, or a cost of goods sold. A supplier bill uses the purchase expense account, not an inventory asset.

**Who uses it.** Someone who maintains the catalog.

There is no search box. Up to 100 products are listed. The form asks for an optional default tax code and an optional purchase expense account. It does not ask for a category, unit, description, or notes. New products are saved as active. Sales and return accounts must be active income accounts that are not headers. The purchase account, when set, must be an active expense account that is not a header.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| SKU | Yes | 1 to 32 characters. Must be unique. | Example: `SVC-CONSULT` | The product code. |
| Name | Yes | 1 to 160 characters. | Example: `Design consultation` | The default description on an invoice line. |
| Type | Yes | Service, Non-stock, or Stock. | Example: `Service` | Stock does not track quantity in this version. |
| Sales price | Yes | A decimal number of zero or more. The box starts at `0.00`. | Example: `150.00` | A catalog price. The invoice screen asks you to type the price again. It does not fill this in for you. |
| Sales account | Yes | Income accounts from the chart. | Example: `4100 Sales` | The income account credited when an invoice for this product is posted. The invoice stores the account that was current at that time. |
| Default tax code | Optional | An active tax code, or **No tax**. | Example: `STD Standard rate` | Used only when a new invoice line does not send its own tax code. Changing this later does not change a draft or posted invoice that already stored a code. |
| Purchase account | Optional | Expense accounts, or **Not set**. | Example: `5100 Operating expenses` | Required before this product can be used on a supplier bill. The bill stores the account that was current when the bill was saved. |
| Return account | Yes | Income accounts from the chart. | Example: `4100 Sales` | Stored on the product. A return linked to an invoice uses the sales account saved on the invoice line, not a later change to this field. |
| Add product | Button | — | — | Saves the product. It does not post a journal and does not change stock. |

Table columns: **SKU**, **Name**, **Type**, and **Price**. There is no edit button on the product row.

**Supplier links** is a second form on the same page. A product can have several suppliers. Saving replaces the links for the selected product. If you mark one supplier preferred, the others on that product are saved as not preferred.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Product | Yes | A product from the list. | Example: `SVC-CONSULT Design consultation` | The product the link belongs to. |
| Supplier | Yes | An active supplier. | Example: `S001 Harbor Paper` | One row per supplier. |
| Supplier item code | Optional | Text. | Example: `HP-100` | The supplier’s own item code. It is not a stock movement. |
| Purchase price | Yes | A decimal number of zero or more. | Example: `10.00` | Stored on the link. A new bill can fill the unit price from this link when you choose the product. |
| Lead time (days) | Yes | A whole number. The box starts at `0`. | Example: `7` | Recorded only. It does not create a stock receipt. |
| Preferred | Yes | **No** or **Yes**. | Example: `Yes` | One preferred supplier per product. |
| Save supplier link | Button | — | — | Saves the links. It does not post a journal. |

The link table columns are **Supplier**, **Item code**, **Price**, **Lead time**, and **Preferred**.

### Invoices

Menu: **Invoices**. Route: `/invoices`. View permission: `invoices.view`.

**Purpose.** Bill a customer. Posting debits accounts receivable and credits the product’s sales account, plus the tax code’s sales tax account when the line has tax. Tax is calculated from the company pricing mode and the tax code on the line. The customer’s tax country does not choose the rate.

**Who uses it.** Sales staff, then an approver, then someone who can post.

**Prerequisites.** An active customer, an active product with a sales account, a branch, an open fiscal period, and a receivable control account on **Sales settings**.

The list has no search box and shows up to 100 invoices. **New invoice** is shown for `invoices.create` and opens `/invoices/new`.

| Column | Meaning |
| --- | --- |
| Number | Select it to open the invoice. |
| Customer | Display name. |
| Date | Invoice date. |
| Due | Invoice date plus the customer’s payment terms at the time you saved the invoice. |
| Status | draft, submitted, approved, posted, rejected, void, or reversed. |
| Total | What the customer is billed, after the line discount and tax stored on the invoice. |

#### New invoice

The form saves one line. It shows a discount and a tax code. It does not show notes, a due date, or **Add line**. Choosing a product fills that product’s current tax code. You can choose another active code or **No tax** when the role includes `tax_codes.view`. Without that permission, the form keeps the product’s tax code and says so. The branch list shows the branches assigned to the signed-in user, or every branch when none are assigned. It does not require `branches.view`. Customers and products load with `customers.view` and `products.view`. The sales tax account is chosen on **Tax codes**, not here. When you can choose a tax code, the screen sends the code you chose, so a later change to the product does not replace it.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Customer | Yes | Active customers. | Example: `C001 Harbor Supplies` | The customer who owes the invoice. An inactive customer is rejected. |
| Branch | Yes | Branches you can access. | Example: `MAIN Main studio` | Stored on the invoice. Users limited to other branches cannot see it. |
| Invoice date | Yes | A calendar date. Starts as today. | Example: `2026-02-01` | The document date. Due date is this date plus the customer’s payment terms. |
| Product | Yes | Active products. | Example: `SVC-CONSULT Design consultation` | The product supplies the description and the sales account. |
| Quantity | Yes | A number greater than zero. | Example: `2` | Multiplied by the unit price. |
| Unit price | Yes | A decimal number of zero or more. The box starts at `0.00`. You must type the price. It is not copied from the product. | Example: `150.00` | Extended price is quantity times this price, rounded to the company decimal places. |
| Discount | Optional | A decimal number of zero or more, not more than the extended price. The box starts at `0`. | Example: `10.00` | Reduces the amount tax is calculated on. |
| Tax code | Optional | An active tax code that is effective on the invoice date, or **No tax**. A rate above zero must already have a sales tax account. | Example: `STD Standard rate` | Filled from the product when you choose the product. Clear it to charge no tax. |
| Save draft | Button | — | — | Creates a draft. It does not post and does not copy customer tax details. |

Example result: quantity `2` and price `150.00`, with no discount and no tax code, gives a total of `300.00`. A 10 percent exclusive tax code on that amount adds `30.00` of tax.

#### Invoice detail

Route: `/invoices/{id}`.

You see the number, customer, invoice date, due date, and status. When **Show customer tax identifiers** is on and this invoice was posted while that switch was on, a **Customer tax details** block shows the copy taken at posting. That copy can include tax country, the generic tax identifier, and, only when the tax country was `PK`, party type, CNIC/NTN, and STRN. A company or AOP NTN is shown as `1234567-8` when a check digit was stored. The check digit is not verified. Later edits to the customer do not change this block. Drafts do not show it.

The line table headings are **Description**, **Qty**, **Price**, **Discount**, **Tax code**, **Tax**, and **Total**. On a draft or rejected invoice you can change the discount and tax code, then choose **Save line tax and discount**. That save sends the code you chose. Under the table you see tax and total.

| Button | When it appears | What it does |
| --- | --- | --- |
| Submit | Draft or rejected | Sends it for approval. Does not post. |
| Approve | Submitted | Marks it approved. If the company requires a different approver, you cannot approve your own submission. |
| Post | Approved | Posts the invoice. Debits the receivable control account for the total. Credits each line’s sales account. Credits the tax account only when the line has tax. Checks the credit limit. Fails if the posting date’s period is closed. The screen does not ask for a different posting date. It uses the invoice date. |
| Reverse | Posted | Posts the opposite journal and marks the invoice reversed. Fails if a posted receipt allocation or a posted return still applies. The reason box must be filled. The page does not label a minimum length. The system accepts a reason from 1 to 500 characters. |
| Reason | Next to Reverse | Placeholder **Reason**. Used only by Reverse on this screen. |

This screen does not show Reject, Void, a credit-limit override, or a due-date override. Those actions exist in the system but not on the page. A draft can change the line discount and tax code. It cannot change the customer, quantity, or price on this page.

### Receipts

Menu: **Receipts**. Route: `/receipts`. View permission: `receipts.view`.

**Purpose.** Record money received from a customer, then apply it to posted invoices.

**Who uses it.** Someone who records customer payments, then an approver, then someone who can post and allocate.

**Prerequisites.** Sales settings must be saved. If **Unapplied receipts** is **Customer advance liability**, **Customer advances** must be selected. Otherwise **New receipt** is rejected. The cash account must be an active asset account and must not be the receivable control account.

The list has no search box and shows up to 100 receipts. **New receipt** opens `/receipts/new`.

| Column | Meaning |
| --- | --- |
| Number | Select it to open the receipt. |
| Customer | Display name. |
| Date | Receipt date. |
| Status | draft, submitted, approved, posted, rejected, void, or reversed. |
| Amount | The full amount received. |
| Unallocated | The part not yet applied to an invoice. |

#### New receipt

Allocations are not entered here. You allocate after posting.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Customer | Yes | Active customers. | Example: `C001 Harbor Supplies` | Whose payment this is. |
| Branch | Yes | Branches you can access. | Example: `MAIN` | Stored on the receipt. |
| Cash or bank | Yes | Asset accounts that can be posted to. | Example: `1110 Cash on hand` | The account debited for the full amount. |
| Date | Yes | A calendar date. Starts as today. | Example: `2026-02-10` | The receipt date and the posting date used when you post. |
| Amount | Yes | A decimal number greater than zero. The box starts at `0.00`. | Example: `300.00` | The full amount received. |
| Save draft | Button | — | — | Saves a draft. If the advance account is missing, this button fails before a draft is stored. |

#### Receipt detail

Route: `/receipts/{id}`.

You see the number, customer, status, the unapplied treatment (`customer_advance` or `credit_ar`), and the unallocated amount. The allocation table has no headings. Columns are invoice number, amount, status, and **Unallocate** when that allocation is posted.

| Control | When it appears | What it does |
| --- | --- | --- |
| Submit | Draft or rejected | Sends the receipt for approval. |
| Approve | Submitted | Approves it. The distinct-approver rule applies when the company setting is on. |
| Post | Approved | Posts the cash entry. Advance treatment: debit cash, credit the customer-advance liability for the full amount. Credit-receivable treatment: debit cash, credit accounts receivable for the full amount. Does not apply the money to an invoice until you allocate. |
| Invoice list | Posted | Posted invoices. The list is not limited to this customer on the data loaded for the box. Choose the invoice you intend to pay. The system rejects an invoice for a different customer or an invoice that is not posted. |
| Amount | Posted | Placeholder **Amount**. Cannot exceed the unallocated receipt or the open invoice balance. |
| Allocate | Posted | Applies that amount. Advance treatment also posts a second entry: debit the advance liability, credit accounts receivable. Credit-receivable treatment does not post a second entry. It only records which invoice was paid. |
| Unallocate | On a posted allocation | Removes that application. For an advance receipt, it reverses the allocation entry and puts the amount back to unallocated. The invoice can then be reversed only after posted returns are reversed as well. |

This screen does not show Void or Reverse. Those actions exist in the system but not on the page. You also cannot edit a draft from this screen.

Open invoice balance is the invoice total, minus posted returns, minus posted allocations. Unallocated receipt money is not part of that balance and is not part of aging.

### Customer returns

Menu: **Customer returns**. Route: `/customer-returns`. View permission: `customer_returns.view`.

**Purpose.** Reduce what a customer owes for a specific posted invoice line.

**Who uses it.** Sales or accounts staff, then an approver, then someone who can post.

**Prerequisites.** A posted invoice, the same customer, a branch, an open period, and the receivable control account. The return cannot be for a voided, reversed, draft, or otherwise unposted invoice.

The page says a linked return names one invoice line, and that posted quantity and value cannot exceed what remains. It also says this phase does not change stock quantity or cost of goods sold. That matches the system.

The form always creates a linked return, not an unreferenced one. Disposition is always stored as restockable. The screen does not ask you to choose damaged or non-restockable, and that choice would not change the accounts anyway.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Customer | Yes | Active customers. | Example: `C001 Harbor Supplies` | Loads that customer’s posted invoice lines. |
| Branch | Yes | Branches. | Example: `MAIN` | Stored on the return. |
| Invoice line | Yes | One line from a posted invoice for that customer. The option shows the invoice number and the line description. | Example: `INV-00001 · Design consultation` | The line being returned. The system locks this line when you post so two people cannot return more than the remainder. |
| Quantity | Yes | Greater than zero, and not more than the quantity still available on that line. | Example: `1` | If this quantity uses up the line, the return takes the remaining value so several partial returns cannot exceed the original line. |
| Date | Yes | A calendar date. Starts as today. | Example: `2026-02-12` | The return date and the posting date used when you post. |
| Reason | Yes | 1 to 500 characters. | Example: `Customer cancelled the second session` | Required on every return. It is also kept on the posted document. |
| Save draft return | Button | — | — | Saves a draft. It does not post and does not change stock. |

The list columns are **Number**, **Customer**, **Date**, **Status**, **Total**, and **Reason**. Select the number to open the return. There is no search box.

#### Return detail

Route: `/customer-returns/{id}`.

You see the number, status, and reason. The line table has no headings. Columns are description, quantity, line total, and disposition.

| Button | When it appears | What it does |
| --- | --- | --- |
| Submit | Draft or rejected | Sends it for approval. |
| Approve | Submitted | Approves it. The distinct-approver rule applies when the company setting is on. |
| Post | Approved | Posts the return. Debits the sales account saved on the original invoice line for the taxable amount. Debits the tax account if the return has tax. Credits accounts receivable for the customer value. Recalculates the amount from the saved invoice line while that line is locked. Fails if the quantity or value is no longer available, or if the invoice is not still posted. |
| Reverse | Posted | Posts the opposite entry and marks the return reversed. The quantity becomes available on the invoice line again. The reason box is required. |
| Reason | Next to Reverse | Placeholder **Reason**. |

This screen does not show Reject, Void, or an edit form. It does not offer an unreferenced return.

## 10. Purchasing

Purchasing uses the same draft, submit, approve, and post path as sales. Posted bills, payments, and returns are corrected by reversal. They are not edited or deleted. A bill does not receive stock, and a supplier return does not send stock back. Quantity handling is a later phase. Costing and inventory value are a later phase after that.

### Suppliers

Menu: **Suppliers**. Route: `/suppliers`. View permission: `suppliers.view`. Create permission: `suppliers.create`. Update permission: `suppliers.update`.

**Purpose.** Keep the people and companies you buy from, including contacts, a billing address, payment terms, and tax identifiers. Saving a supplier does not post a balance.

**Who uses it.** Purchasing staff.

There is no search box. Up to 100 suppliers are listed. Click a row to edit it. The page then shows payables, unapplied advances, linked products, and recent bills, payments, and returns.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Code | Yes | 1 to 32 characters. Must be unique. | Example: `S001` | The supplier code. |
| Legal name | Yes | 1 to 160 characters. | Example: `Harbor Paper Ltd` | The legal name. |
| Display name | Yes | 1 to 160 characters. | Example: `Harbor Paper` | Shown on bills and reports. |
| Payment terms (days) | Yes | A whole number from 0 to 3650. | Example: `30` | The default due date of a new bill is the bill date plus these days. |
| Status | Yes | **Active** or **Inactive**. | Example: `Active` | Inactive suppliers cannot be used on new documents that require an active supplier. |
| Tax country | Optional | Two letters, or blank. | Example: `PK` | Does not choose a tax rate. |
| Tax identifier | Optional | Up to 60 characters. | Example: `TAX-900` | A generic identifier. It is not copied into CNIC/NTN. |
| Party type | Required when tax country is `PK` | **Individual**, **Company**, or **AOP**. | Example: `Company` | Hidden unless the tax country is `PK`. |
| CNIC/NTN | Required when tax country is `PK` | An individual CNIC is 13 digits. A company or AOP NTN is 7 digits, or the printed form `1234567-8`. | Example: `1234567-8` | The check digit is stored for display and is not verified. |
| STRN | Optional when tax country is `PK` | Up to 60 characters. | Example: `12-34-5678-901-23` | Hidden unless the tax country is `PK`. |
| Billing address | Optional | 1 to 160 characters when you also enter a country. | Example: `12 Dock Road` | Stored as the primary billing address. |
| Address country | Required with an address | Exactly two letters. | Example: `PK` | The address country. |
| Primary contact | Optional | 1 to 160 characters. | Example: `Sana Iqbal` | Stored as the primary contact. |
| Add supplier / Save supplier | Button | — | — | Saves the supplier. **Cancel** appears while you are editing. A tax country other than `PK` clears party type, CNIC/NTN, and STRN. |

While you are editing, **Products** lists item code, purchase price, lead time, and preferred. **Transactions** lists kind, number, date, status, and total. The balance line separates payables from unapplied advances. Advances are not part of bill aging. ATL status and FBR connections are not stored.

### Supplier bills

Menu: **Supplier bills**. Route: `/bills`. View permission: `bills.view`. Create permission: `bills.create`.

**Purpose.** Record what a supplier billed you. Posting debits the product’s purchase expense account, debits the tax code’s purchase tax asset when the line has tax, and credits accounts payable. It does not debit an inventory asset.

**Who uses it.** Purchasing staff, then an approver, then someone who can post.

**Prerequisites.** An active supplier, an active product with a purchase expense account, a branch, an open fiscal period, a payable control account, and, when the line has tax, a purchase tax asset on that tax code.

**New bill** opens `/bills/new`. The form saves one line.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Supplier | Yes | Active suppliers. | Example: `S001 Harbor Paper` | The bill’s supplier. |
| Branch | Yes | Branches you can access. | Example: `HQ Head office` | Stored on the bill and on the journal. |
| Bill date | Yes | A calendar date in an open period when you post. | Example: `2026-03-01` | The due date is this date plus the supplier’s payment terms, unless a later edit overrides it. Overriding the due date needs `bills.override_due_date`. The new-bill screen does not show a due-date box. |
| Product or service | Yes | Active products. | Example: `SVC-CONSULT` | Choosing it can fill the unit price from that supplier’s product link. |
| Description | Optional | Up to 240 characters. | Example: `March paper` | Blank uses the product name. |
| Quantity | Yes | A decimal greater than zero. | Example: `3` | Stored on the line. It is not a warehouse receipt. |
| Unit price | Yes | A decimal of zero or more. | Example: `10.00` | Exclusive tax adds tax on top. Inclusive tax treats this price as already including tax. |
| Discount | Optional | A decimal of zero or more. The box starts at `0`. | Example: `0` | Reduces the taxable base. |
| Tax code | Optional | An active tax code, or **No tax**. | Example: `STD Standard rate` | Filled from the product when you choose the product. A rate above zero must already have a purchase tax asset. |
| Create bill | Button | — | — | Saves a draft. It does not post a journal. The bill is rejected if the product has no purchase expense account. |

The list columns are **Number**, **Supplier**, **Date**, **Due**, **Status**, and **Total**. Open a number to see the bill.

On a draft or rejected bill you can change the line discount and tax code, then press **Save line tax and discount**. You cannot change the supplier, quantity, or price on that page. **Submit**, **Approve**, and **Post** follow the usual path. **Post** needs an open period. When **Show supplier tax identifiers** is on, posting copies the supplier’s tax details onto the bill. **Reverse** needs a reason and is blocked while a posted payment allocation or a posted supplier return still applies. The screen does not show Reject or Void.

### Supplier payments

Menu: **Supplier payments**. Route: `/supplier-payments`. View permission: `supplier_payments.view`. Create permission: `supplier_payments.create`. Allocate permission: `supplier_payments.allocate`.

**Purpose.** Pay a supplier and apply that money to posted bills. One payment can cover more than one bill. A partial payment is allowed.

**Who uses it.** Purchasing or finance staff.

**Prerequisites.** Purchasing settings must have a payable control account. The cash account must be an active asset and must not be the payable control or the supplier-advance account. A payment that is not fully applied also needs **Supplier advances** selected. A fully applied payment does not need that asset.

**New payment** opens `/supplier-payments/new`.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Supplier | Yes | Active suppliers. | Example: `S001 Harbor Paper` | Loads that supplier’s posted bills. |
| Branch | Yes | Branches you can access. | Example: `HQ Head office` | Stored on the payment. |
| Date | Yes | A calendar date. | Example: `2026-03-15` | The payment date. |
| Cash or bank | Yes | Asset accounts. | Example: `1110 Cash` | The account credited when the payment is posted. |
| Amount | Yes | A decimal greater than zero. | Example: `22.00` | The full payment. |
| Bill | Optional | A posted bill, or **No allocation yet**. | Example: `BILL-00001` | The bill this draft applies money to. |
| Amount applied to the bill | Optional | A decimal up to the payment amount. | Example: `22.00` | Leave it blank, or lower than the payment, only when a supplier advance asset is configured. |
| Create payment | Button | — | — | Saves a draft. |

The list shows number, supplier, date, status, treatment, amount, and unapplied amount. Treatment is `direct_ap` when the payment is fully applied, and `supplier_advance` when any amount is unapplied.

On the payment page, **Submit**, **Approve**, and **Post** follow the usual path. A fully applied payment debits accounts payable and credits cash. A payment with an unapplied remainder debits the supplier-advance asset and credits cash. Posting that remainder fails with a setup message until the advance asset is selected. After a `supplier_advance` payment is posted, **Apply advance to bill** posts a separate balanced entry: debit accounts payable, credit the advance asset. **Unallocate** reverses a separate allocation. A direct application cannot be unallocated on its own; reverse the payment instead. **Reverse** needs a reason and is blocked while a separate allocation journal still exists. The screen does not show Reject or Void.

### Supplier returns

Menu: **Supplier returns**. Route: `/supplier-returns`. View permission: `supplier_returns.view`. Create permission: `supplier_returns.create`. An unreferenced return also needs `supplier_returns.create_unreferenced`.

**Purpose.** Record a return to a supplier or a debit note. A linked return uses the source bill line’s saved price, discount, tax, and accounts. Posting debits accounts payable and credits the purchase expense and the purchase tax asset. It does not move warehouse quantity or change inventory value.

**Who uses it.** Purchasing staff, then an approver, then someone who can post.

**New return** opens `/supplier-returns/new`.

| Label | Required | Allowed values | Example | Effect |
| --- | --- | --- | --- | --- |
| Supplier | Yes | Active suppliers. | Example: `S001 Harbor Paper` | Loads that supplier’s posted bills. |
| Branch | Yes | Branches you can access. | Example: `HQ Head office` | Stored on the return. |
| Date | Yes | A calendar date. | Example: `2026-03-20` | The return date. |
| Reason | Yes | 1 to 500 characters. | Example: `Damaged ream` | Required for every return, including a linked one. |
| Source | Yes | **Linked to a bill line** or **Unreferenced**. | Example: `Linked to a bill line` | Unreferenced needs the extra permission, a product, a price, a tax code or no tax, and a purchase expense account. |
| Bill | Required when linked | A posted bill for this supplier. | Example: `BILL-00001` | A voided or reversed bill cannot be used. |
| Bill line | Required when linked | A line on that bill. | Example: `Design consultation (3)` | The return uses that line’s saved price, tax, discount, and accounts. |
| Product, unit price, tax code, purchase account | Required when unreferenced | An active product, a price, an optional tax code, and an expense account. | Example: purchase account `5100 Operating expenses` | These values are explicit. They are not copied from a bill. |
| Quantity | Yes | A decimal greater than zero, not above the quantity still returnable on a linked line. | Example: `1` | Cumulative posted returns cannot exceed the source line. |
| Disposition | Yes | **Restockable**, **Damaged**, or **Non-restockable**. | Example: `Damaged` | Stored only. It does not post stock. |
| Create return | Button | — | — | Saves a draft. A quantity above the remainder is rejected. |

The detail page shows description, quantity, price, tax, total, and disposition. **Submit**, **Approve**, **Post**, and **Reverse** follow the usual path. Posting locks the source line. The screen does not show Reject or Void.

## 11. Reports

Menu group: **Reports**. Every report needs `reports.view`. **Export CSV** also needs `reports.export`.

All of these reports include posted activity only. The date filters use the posting date, not the transaction date. **Print / PDF** opens the browser print dialog. There is no separate PDF button.

Receivables reports refuse to run if customer detail does not equal the receivable control account, or if that account has not been chosen. The message tells you the report was not produced. Unapplied customer advances are not included in aging.

Amounts on report screens are shown with two decimal places.

### Trial balance

Menu: **Trial balance**. Route: `/reports/trial-balance`.

**Purpose.** Show each account’s debit or credit balance from posted journals, and whether total debits equal total credits.

| Label | Required | Meaning | Example |
| --- | --- | --- | --- |
| As of | Yes for a useful report | Includes posted journals with a posting date on or before this date. Starts as today. | Example: `2026-02-28` |
| Run | Button | Builds the report. | — |
| Export CSV | After a successful run, if you may export | Downloads the rows. | — |
| Print / PDF | Button | Prints the page. | — |

The result says **In balance.** or **Out of balance.** and shows total debits and credits. Columns are **Code**, **Name**, **Debit**, and **Credit**. An account with no posted activity in range is not listed.

### Profit and loss

Menu: **Profit and loss**. Route: `/reports/profit-and-loss`.

**Purpose.** Income minus expenses for posted activity between two posting dates.

| Label | Required | Meaning | Example |
| --- | --- | --- | --- |
| From | Yes | First posting date included. Starts as 1 January of the current year. | Example: `2026-01-01` |
| To | Yes | Last posting date included. Starts as today. | Example: `2026-02-28` |
| Run, Export CSV, Print / PDF | Same as the other reports. | — | — |

The summary shows Income, Expenses, and Net. Columns are **Code**, **Name**, **Type**, and **Amount**. Income and expense amounts are signed so that income increases the result and expenses reduce it.

### Balance sheet

Menu: **Balance sheet**. Route: `/reports/balance-sheet`.

**Purpose.** Assets, liabilities, and equity from posted balances as of a date. Profit that has not been closed into retained earnings is included so the statement can balance.

| Label | Required | Meaning | Example |
| --- | --- | --- | --- |
| As of | Yes | Posted balances on or before this date. Starts as today. | Example: `2026-02-28` |
| Run, Export CSV, Print / PDF | Same as the other reports. | — | — |

The page says whether the statement balances. Sections are **Assets**, **Liabilities**, and **Equity**, each with **Code**, **Name**, and **Amount**. It also shows **Unclosed profit or loss**, total assets, and liabilities and equity.

### General ledger

Menu: **General ledger**. Route: `/reports/general-ledger`.

**Purpose.** The posted lines of one account, with a running balance.

| Label | Required | Meaning | Example |
| --- | --- | --- | --- |
| From | Yes | First posting date. | Example: `2026-01-01` |
| To | Yes | Last posting date. | Example: `2026-02-28` |
| Account | Yes | A postable account. The list is limited to 100 accounts. | Example: `1110 Cash on hand` |
| Run, Export CSV, Print / PDF | Same as the other reports. | — | — |

The page shows opening and closing balances. Columns are **Entry**, **Transaction date**, **Posting date**, **Description**, **Debit**, **Credit**, and **Balance**. The running balance follows the account’s normal side.

### Journal report

Menu: **Journal report**. Route: `/reports/journals`.

**Purpose.** A line-by-line list of posted journals in a posting-date range.

| Label | Required | Meaning | Example |
| --- | --- | --- | --- |
| From | Yes | First posting date. | Example: `2026-01-01` |
| To | Yes | Last posting date. | Example: `2026-02-28` |
| Run, Export CSV, Print / PDF | Same as the other reports. | — | — |

Columns are **Entry**, **Transaction date**, **Posting date**, **Account**, **Debit**, and **Credit**. Drafts are not included.

### Receivables aging

Menu: **Receivables aging**. Route: `/reports/receivables-aging`.

**Purpose.** Show posted invoices that still have an open balance, grouped by how late they are compared with the due date.

| Label | Required | Meaning | Example |
| --- | --- | --- | --- |
| As of | Yes | Invoices posted on or before this date. Open amount also depends on returns and allocations that are active as of this date. Starts as today. | Example: `2026-03-31` |
| Run, Export CSV, Print / PDF | Same as the other reports. | — | — |

The page shows **Open**, which is the total still owed on invoices. It states that unapplied advances are not included. A customer advance that has not been allocated does not reduce this total.

Columns are **Invoice**, **Customer**, **Due**, **Open**, and **Bucket**.

The bucket value is a code:

| Code on screen | Meaning |
| --- | --- |
| current | Due on or after the As of date. |
| days1To30 | 1 to 30 days past the due date. |
| days31To60 | 31 to 60 days past due. |
| days61To90 | 61 to 90 days past due. |
| days91Plus | More than 90 days past due. |

Open amount is the invoice total, minus posted returns, minus receipt amounts allocated to that invoice. An invoice with nothing left open is omitted. There is no customer filter on this screen.

If the report is refused, customer totals and the receivable control account do not match. Do not use a partial list. Correct the books first.

### Customer statement

Menu: **Customer statement**. Route: `/reports/customer-statement`.

**Purpose.** One customer’s receivable movements between two posting dates, with a running balance.

| Label | Required | Meaning | Example |
| --- | --- | --- | --- |
| From | Yes | First posting date in the list. Starts as 1 January of the current year. | Example: `2026-02-01` |
| To | Yes | Last posting date. Starts as today. | Example: `2026-02-28` |
| Customer | Yes | A customer. The list is limited to 100 customers. | Example: `C001 Harbor Supplies` |
| Run, Export CSV, Print / PDF | Same as the other reports. | — | — |

The page shows **Opening** and **Closing**. Opening is that customer’s receivable balance on the day before **From**. The company-wide receivable control account is checked at both the opening date and the **To** date. If they do not match customer detail, the statement is not produced.

Columns are **Kind**, **Number**, **Date**, **Amount**, and **Balance**. Amounts that reduce what the customer owes are negative.

Kind is a code:

| Code | Meaning |
| --- | --- |
| invoice | A posted invoice increases the balance. |
| customer_return | A posted return decreases the balance. |
| receipt | A receipt that was set to credit accounts receivable decreases the balance by the full receipt. |
| allocation | An allocation from a customer-advance receipt decreases the balance. |
| reversal | A reversal of one of those documents. The sign is the opposite of the original. |

Unallocated advance receipts do not appear as a reduction of this receivable balance. They are still held as a liability until allocated.

### Sales

Menu: **Sales**. Route: `/reports/sales`. This item is on the Reports menu in addition to the statements above.

**Purpose.** Posted invoices, posted customer returns, and their reversals, by posting date.

| Label | Required | Meaning | Example |
| --- | --- | --- | --- |
| From | Yes | First posting date. | Example: `2026-02-01` |
| To | Yes | Last posting date. | Example: `2026-02-28` |
| Run, Export CSV, Print / PDF | Same as the other reports. | — | — |

The page shows **Total**. Columns are **Kind**, **Number**, **Date**, **Customer**, **Taxable**, **Tax**, and **Total**. Returns are negative. A reversal of an invoice is negative. A reversal of a return is positive. Receipts are not in this report. The figures follow the documents’ saved totals, not a separate inventory cost.

### Payables aging

Menu: **Payables aging**. Route: `/reports/payables-aging`.

**Purpose.** Open posted supplier bills as of a posting date, grouped by how late they are. Unapplied supplier advances are not included. The report runs only when the payable subledger equals the payable control account.

| Label | Required | Meaning | Example |
| --- | --- | --- | --- |
| As of | Yes | The last posting date included. | Example: `2026-03-31` |
| Run, Export CSV, Print / PDF | Same as the other reports. | — | — |

Columns are **Bill**, **Supplier**, **Due**, **Open**, and **Bucket**. The page shows the open total.

### Supplier statement

Menu: **Supplier statement**. Route: `/reports/supplier-statement`.

**Purpose.** One supplier’s payable balance between two posting dates. The running balance is the payable subledger. Unapplied advances are not part of this balance.

| Label | Required | Meaning | Example |
| --- | --- | --- | --- |
| From | Yes | First posting date. | Example: `2026-03-01` |
| To | Yes | Last posting date. | Example: `2026-03-31` |
| Supplier | Yes | The supplier. | Example: `S001 Harbor Paper` |

The page shows opening and closing balances. Columns are **Kind**, **Number**, **Date**, **Amount**, and **Balance**. A bill increases the balance. A return, a direct payment, and an advance application decrease it.

### Purchases

Menu: **Purchases**. Route: `/reports/purchases`.

**Purpose.** Posted supplier bills, posted supplier returns, and their reversals, by posting date. The totals follow the documents, not an inventory cost.

Columns are **Kind**, **Number**, **Date**, **Supplier**, **Taxable**, **Tax**, and **Total**. A return is negative. A reversal of a bill is negative. A reversal of a return is positive. Payments are not in this report.

### Supplier returns report

Menu: **Supplier returns report**. Route: `/reports/supplier-returns`.

**Purpose.** Posted supplier returns and their reversals, by posting date.

The columns match **Purchases**. A return is positive here. A reversal of a return is negative.

## 12. What the screens do not offer yet

These items are not on the pages described above. Do not expect to complete them by clicking through the menu.

| Item | What is missing |
| --- | --- |
| Inventory quantity and stock movements | Not calculated. A product type of Stock is only a label. Supplier bills and returns do not receive or issue quantity. That handling belongs to a later phase. |
| Inventory value and cost of goods sold | Not calculated. Purchases post to the purchase expense account. Costing and valuation belong to a later phase, after the costing method is chosen. |
| ATL tracking and FBR/IRIS connections | Not stored and not connected. |
| Edit, deactivate, or delete an account | You can add an account and read the list. |
| Edit a branch, or enter its city | You can add a branch. The list shows code, name, and active status. |
| Retire a tax code | You can add a code and set its sales and purchase tax accounts. There is no retire button. |
| More than one invoice or bill line | The new-invoice form and the new-bill form each have one product line. |
| Edit a draft invoice, receipt, return, bill, or supplier payment | A draft invoice or bill can change the line discount and tax code. It cannot change the party, quantity, or price on that page. Receipt, payment, and return detail pages do not show an edit form. |
| Reject or void a sales or purchasing document from the screen | Journals have these buttons. Invoices, receipts, customer returns, bills, supplier payments, and supplier returns do not. |
| Reverse or void a receipt from the screen | You can unallocate. The receipt page has no Reverse or Void button. |
| Unreferenced customer return | Not on the form. Every return from the screen must name an invoice line. |
| Customer return condition other than restockable | Not on the customer-return form. The stored value does not change the accounts. Supplier returns do ask for a disposition, and that value still does not move stock. |
| Customer or supplier opening balances | There is no screen. A manual journal cannot use the receivable or payable control account. An opening-balance journal can use one only when the matching customer or supplier amounts equal that line, and those amounts cannot be entered here. |
| Search boxes | Most lists do not show a search field, even where the system could filter. Long lists stop at 50 or 100 rows. |

## 13. Glossary

| Term | Meaning in this system |
| --- | --- |
| Chart of accounts | The numbered list of asset, liability, equity, income, and expense accounts. |
| Journal | A set of debit and credit lines. A manual journal is typed by a person. Invoices, receipts, returns, supplier bills, supplier payments, and supplier returns create journals when they are posted. |
| Debit | The left amount on a journal line. It increases assets and expenses. |
| Credit | The right amount on a journal line. It increases liabilities, equity, and income. |
| Posting | The step that puts an approved document into the ledger. Reports use posted items only. |
| Reversal | A new posted journal that swaps the original debits and credits. This is how a posted item is corrected. |
| Fiscal period | A month inside a fiscal year. Posting is allowed only while that month and its year are open. |
| Control account | A summary account, such as accounts receivable or accounts payable. Customer or supplier documents keep the detail. The totals must match before the matching aging or statement report will run. |
| Receivable | Money a customer owes the company. |
| Payable | Money the company owes a supplier. |
| Tax code | A named percentage and a start date. A rate above zero needs a sales tax liability, a purchase tax asset, or both. It does not certify a country’s tax rules. Invoice and bill screens ask for the code. They do not ask for the tax account. |
| Aging | A report of open invoices or open bills grouped by how many days have passed since the due date. Unapplied advances are excluded. |
| Allocation | Applying part or all of a receipt to a posted invoice, or part or all of a supplier payment to a posted bill. |
| Customer advance | Money received that is not yet applied to an invoice. It is held in a liability account when that sales setting is in use. |
| Supplier advance | Money paid to a supplier that is not yet applied to a bill. It is held in an asset account. It is excluded from payables aging. |
| Draft | A saved document that is not in the official reports. |
| Branch | A location stored on sales and purchasing documents. Company Admin can see every branch. |
