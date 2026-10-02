export type UserInput = {
  email: string;
  displayName: string;
  isActive: boolean;
  password?: string;
  roleIds: string[];
  branchIds: string[];
};
