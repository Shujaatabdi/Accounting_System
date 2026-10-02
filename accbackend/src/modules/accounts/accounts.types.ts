import type { AccountType } from "../reports/reports.calculations";

export type AccountInput = {
  code: string;
  name: string;
  accountType: AccountType;
  accountSubtype?: string | null;
  parentId?: string | null;
  isHeader: boolean;
  isControl: boolean;
  isActive: boolean;
  description?: string | null;
};
