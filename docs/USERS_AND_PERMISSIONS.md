# Users and permissions

The Company Admin role (`company_admin`) is a system role. It always has every permission, can see every branch, and cannot be reduced. The installation must keep at least one active user in that role. Seed creates that user from `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`, and requires a password change at first sign-in.

## Actions

Permissions are stored as `module.action`. The catalog includes view, create, update, manage, submit, approve, post, reverse, void, close, reopen, and export. The exact codes are in `accbackend/src/modules/auth/permissions.ts` and are seeded into `permissions`.

Company Admin bypasses permission checks. Other users need the matching permission. A user who can edit roles still cannot grant a permission they do not hold, and cannot assign Company Admin.

## Branches

- No branch rows on a user, or the Company Admin role: every branch, including journals with no branch.
- One or more branch rows: every journal line must use one of those branches, and reports are filtered to them.

Assign branches when a person should not see the whole company. Empty means unrestricted.

## Approval

`journals.approve` covers approve and reject. `journals.post` posts an approved journal. `journals.reverse` posts a reversal immediately. `journals.void` voids an unposted journal. `periods.close` and `periods.reopen` are separate.

The company flag `requireDistinctApprover` stops a person from approving their own submission.

## Audit

The audit log stores actor, time, action, entity, summary, and before/after JSON where a change has values. Passwords and password hashes are never written there. Covered actions include sign-in success and failure, password change, company and settings changes, user and role changes, account changes, period close and reopen, and journal create, edit, submit, approve, reject, post, void, and reverse.

## Password rule

At least 10 characters, including a letter and a number.
