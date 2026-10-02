export type AddressInput = {
  id?: string;
  addressType: "registered" | "billing" | "other";
  line1: string;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode: string;
  isPrimary: boolean;
};

export type ContactInput = {
  id?: string;
  name: string;
  roleTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary: boolean;
};

export type CompanyInput = {
  legalName: string;
  displayName: string;
  countryCode: string;
  taxIdentifier?: string | null;
  timezone: string;
  currencyName: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  fiscalYearStartMonth: number;
  requireDistinctApprover: boolean;
  logoUrl?: string | null;
  notes?: string | null;
  addresses: AddressInput[];
  contacts: ContactInput[];
};
