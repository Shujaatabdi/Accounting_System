export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  isCompanyAdmin: boolean;
  permissions: string[];
  branchIds: string[] | null;
};

export function can(user: SessionUser | null, permission: string) {
  return Boolean(user && (user.isCompanyAdmin || user.permissions.includes(permission)));
}
