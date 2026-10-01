export const COMPANY_ADMIN_ROLE = "company_admin";

export const PERMISSIONS = [
  ["company.view", "company", "view", "View company profile and settings"],
  ["company.update", "company", "update", "Update company profile and settings"],
  ["numbering.view", "numbering", "view", "View document numbering"],
  ["numbering.update", "numbering", "update", "Update document numbering"],
  ["accounting_profile.view", "accounting_profile", "view", "View the country accounting profile"],
  ["accounting_profile.update", "accounting_profile", "update", "Update the country accounting profile"],
  ["tax_codes.view", "tax_codes", "view", "View tax codes"],
  ["tax_codes.manage", "tax_codes", "manage", "Create and retire tax codes"],
  ["users.view", "users", "view", "View users"],
  ["users.create", "users", "create", "Create users"],
  ["users.update", "users", "update", "Update users and active status"],
  ["roles.view", "roles", "view", "View roles and the permission catalog"],
  ["roles.create", "roles", "create", "Create roles"],
  ["roles.update", "roles", "update", "Update roles and their permissions"],
  ["branches.view", "branches", "view", "View branches and locations"],
  ["branches.create", "branches", "create", "Create branches and locations"],
  ["branches.update", "branches", "update", "Update branches and locations"],
  ["accounts.view", "accounts", "view", "View the chart of accounts"],
  ["accounts.create", "accounts", "create", "Create accounts"],
  ["accounts.update", "accounts", "update", "Update or delete accounts"],
  ["periods.view", "periods", "view", "View fiscal years and periods"],
  ["periods.manage", "periods", "manage", "Create fiscal years and periods"],
  ["periods.close", "periods", "close", "Close fiscal years and periods"],
  ["periods.reopen", "periods", "reopen", "Reopen fiscal years and periods"],
  ["journals.view", "journals", "view", "View journal entries"],
  ["journals.create", "journals", "create", "Create draft journal entries"],
  ["journals.update", "journals", "update", "Edit draft journal entries"],
  ["journals.submit", "journals", "submit", "Submit journal entries for approval"],
  ["journals.approve", "journals", "approve", "Approve or reject journal entries"],
  ["journals.post", "journals", "post", "Post approved journal entries"],
  ["journals.reverse", "journals", "reverse", "Reverse posted journal entries"],
  ["journals.void", "journals", "void", "Void unposted journal entries"],
  ["reports.view", "reports", "view", "View official financial reports"],
  ["reports.export", "reports", "export", "Export official financial reports"],
  ["audit.view", "audit", "view", "View the audit log"],
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number][0];

export const PERMISSION_CODES = new Set<string>(PERMISSIONS.map((item) => item[0]));
