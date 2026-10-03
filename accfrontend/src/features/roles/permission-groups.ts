export const ROLE_CODE_PATTERN = /^[A-Za-z0-9_]{1,40}$/;
export const ROLE_CODE_MESSAGE = "Role code can use letters, digits, and underscores only, up to 40 characters.";

export type PermissionItem = { code: string; module: string; description: string };

export const PERMISSION_GROUPS = [
  { id: "setup", label: "Setup", modules: ["company", "numbering", "accounting_profile", "tax_codes", "branches"] },
  { id: "access", label: "Access", modules: ["users", "roles", "audit"] },
  { id: "ledger", label: "Ledger", modules: ["accounts", "periods", "journals"] },
  { id: "sales", label: "Sales", modules: ["customers", "products", "invoices", "receipts", "customer_returns"] },
  { id: "purchasing", label: "Purchasing", modules: ["suppliers", "bills", "supplier_payments", "supplier_returns"] },
  { id: "reports", label: "Reports", modules: ["reports"] },
] as const;

export type PermissionGroup = { id: string; label: string; permissions: PermissionItem[] };

export function groupPermissions(items: PermissionItem[]): PermissionGroup[] {
  const assigned = new Set<string>();
  const groups: PermissionGroup[] = PERMISSION_GROUPS.map((group) => {
    const permissions = items.filter((item) => (group.modules as readonly string[]).includes(item.module));
    for (const permission of permissions) assigned.add(permission.code);
    return { id: group.id, label: group.label, permissions };
  }).filter((group) => group.permissions.length > 0);
  const other = items.filter((item) => !assigned.has(item.code));
  if (other.length > 0) groups.push({ id: "other", label: "Other", permissions: other });
  return groups;
}

export function toggleGroup(selected: string[], groupCodes: string[]) {
  const selectedSet = new Set(selected);
  if (groupCodes.every((code) => selectedSet.has(code))) {
    const remove = new Set(groupCodes);
    return selected.filter((code) => !remove.has(code));
  }
  return [...selected, ...groupCodes.filter((code) => !selectedSet.has(code))];
}

export function groupCheckState(selected: string[], groupCodes: string[]): "all" | "some" | "none" {
  const count = groupCodes.filter((code) => selected.includes(code)).length;
  if (count === 0) return "none";
  if (count === groupCodes.length) return "all";
  return "some";
}

export function selectAllPermissions(items: PermissionItem[]) {
  return items.map((item) => item.code);
}

type FieldErrors = { fieldErrors?: Record<string, string[]>; formErrors?: string[]; permissions?: string[] };

export function validationLines(message: string, details?: unknown) {
  if (!details || typeof details !== "object") return [message];
  const fields = details as FieldErrors;
  const lines = [
    ...(fields.formErrors ?? []),
    ...Object.entries(fields.fieldErrors ?? {}).flatMap(([field, messages]) =>
      (messages ?? []).map((item) => `${fieldLabel(field)}: ${item}`),
    ),
  ];
  if (lines.length > 0) return lines;
  if (fields.permissions?.length) return [message];
  return [message];
}

function fieldLabel(field: string) {
  if (field === "code") return "Code";
  if (field === "name") return "Name";
  if (field === "permissions") return "Permissions";
  return field;
}
