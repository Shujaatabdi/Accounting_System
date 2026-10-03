# Accounting rules

## Double entry

Every posted journal has at least two lines. Each line is either a debit or a credit, never both, and never zero. The sum of debits equals the sum of credits and is greater than zero. Amounts use the company currency scale, from 0 to 4 decimal places, and are stored as `numeric(19,4)`.

Account type fixes the normal balance: assets and expenses are debit-normal; liabilities, equity, and income are credit-normal. Header accounts, inactive accounts, and accounts with children cannot be posted.

## Dates

- Transaction date (`entry_date`) is the business date of the document.
- Posting date (`posting_date`) is set when the journal is posted. It defaults to the transaction date and must fall in an open period.
- Official reports filter and order by posting date. Journal lists filter by transaction date. The general ledger shows both dates. The running balance follows posting order.

## Workflow

`draft` → `pending_approval` → `approved` → `posted`

- Only a draft can be edited.
- Submit and approve re-check the balance and the accounts.
- If company setting `requireDistinctApprover` is on, the approver cannot be the submitter. The default is off so a small installation can operate with one administrator.
- Posting locks the period row, snapshots the account code and name onto each line, and sets the poster and posting time.
- Void is allowed only before posting. A posted journal is reversed, not voided or deleted.
- Reversal creates a new posted journal with the debits and credits swapped, in an open period. The original stays posted and points at the reversal. Reversing a reversal is allowed. Reports include every posted journal, so the net effect is what remains.

Opening balances are journals with source type `opening_balance`. They follow the same rules.

## Database guards

Triggers reject an unbalanced post, a post that skips approval (unless the reversal path sets a transaction-local flag), a change to a posted header, and any change to posted line amounts, accounts, or branches. Snapshot columns may be filled while the journal is still approved, immediately before it becomes posted.

## Periods

A date can be posted only when both its period and its fiscal year are open. Closing a year closes its periods. Reopening a year leaves the periods closed. Close and reopen require a reason and are audited. Unposted documents in the date range are counted and left in place.

## Reports

- Trial balance: net posted movement through the as-of posting date. Totals must match.
- Profit and loss: income and expense activity between two posting dates. Net income is income minus expenses, using normal balances.
- Balance sheet: assets, liabilities, and equity through the as-of date, plus unclosed profit or loss. That line is the net of all income and expense accounts. It is not a posted closing entry. After a closing journal moves the net into retained earnings, the line is zero and is not counted twice.
- Reports tell the caller when the statement does not balance.

## History

Posted lines keep the account code and name from posting time. Later renames do not rewrite those snapshots. Account type and code cannot change after any journal line exists. Currency name, symbol, and decimal places cannot change after a journal is posted. Tax codes are effective-dated. An invoice, customer return, supplier bill, or supplier return line stores the rate, tax amount, and tax account from the code selected when that line was saved.

## Purchasing

Purchasing settings are separate from sales settings. Tax pricing is exclusive or inclusive. A line discount reduces the taxable base. The country code does not choose a rate.

A supplier bill posts: debit the product purchase expense for the taxable base, debit the tax code’s purchase tax asset for the tax, and credit the payable control for the total. The purchase account must already be an active non-header expense. A missing mapping blocks the bill. The line is not posted to an inventory asset. Posted bills are reversed, not edited or deleted.

A supplier payment that is fully allocated to bills posts as a debit to the payable control and a credit to cash. A payment with any unapplied amount is blocked until a supplier-advance asset account is configured. That payment debits the advance asset and credits cash. Applying the advance to a bill is a later balanced journal: debit the payable control and credit the advance asset. Unapplied advances are excluded from bill aging.

A linked supplier return uses the source bill line’s saved price, discount, tax, and accounts. Posting locks that line and rejects a cumulative quantity or value above the remainder. Voided and reversed bills are rejected. The return posts: debit the payable control, credit the purchase expense, and credit the purchase tax asset. Disposition is stored and does not move warehouse quantity. An unreferenced return needs its own permission, a reason, explicit price, tax, and purchase account, and the same approval path. Corrections of posted purchasing documents are reversals.

Payables aging and supplier statements use posted open balances. They are withheld when the payable subledger does not equal the payable control account. The subledger is opening supplier detail plus posted bills, minus posted returns, minus direct payable payments, minus advance applications. Aging is the open bill remainder and does not include the advance asset.

Stock receipt and return quantities are not posted in this phase. They belong to Phase 4. Inventory costing, valuation, and cost of goods sold belong to Phase 5.
