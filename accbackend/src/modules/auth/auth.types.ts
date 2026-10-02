export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  isCompanyAdmin: boolean;
  permissions: string[];
  branchIds: string[] | null;
};

export type RequestMeta = {
  actor: AuthUser;
  ipAddress: string | null;
  requestId: string | null;
};
