export type RoleInput = {
  code?: string;
  name: string;
  description?: string | null;
  permissions: string[];
};
