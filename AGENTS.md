# Agent instructions

This repository is the local Accounting System at the configured GitHub remote `https://github.com/Shujaatabdi/Accounting_System.git`. Ignore any previous Cursor cloud project or pull request.

- One company per installation. Do not add tenants, a super admin, or multi-company filters.
- PostgreSQL only. Money and quantities use `numeric` and decimal strings, never binary floats.
- Posted journals are immutable. Corrections are reversals. Drafts do not hit official reports.
- Do not implement sales, purchasing, returns, inventory quantities, banking, costing, or manufacturing until that phase is explicitly requested. Costing method is undecided.
- Do not vendor Metronic. It is commercial and not licensed in this repo. The frontend is our own Next.js 16 / React 19 UI.
- Keep `docs` aligned with the code. Do not describe a feature as implemented unless it exists here.
- Schema changes go in a new SQL migration. Do not edit an applied migration.
- Do not commit secrets. Windows setup is in the root `README.md`.
- Phase 1 is the foundation. Stop after a phase and wait for review before the next one.
