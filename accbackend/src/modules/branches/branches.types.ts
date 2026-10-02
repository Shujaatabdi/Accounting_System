export type BranchInput = {
  code: string;
  name: string;
  isActive: boolean;
  line1?: string | null;
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
};
