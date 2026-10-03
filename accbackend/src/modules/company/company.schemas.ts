import { z } from "zod";

const country = z.string().regex(/^[A-Za-z]{2}$/);

export const companyBody = z.object({
  legalName: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200),
  countryCode: country,
  taxIdentifier: z.string().trim().max(80).nullish(),
  timezone: z.string().trim().min(1).max(80),
  currencyName: z.string().trim().min(1).max(40),
  currencySymbol: z.string().trim().min(1).max(8),
  currencyDecimalPlaces: z.number().int().min(0).max(4),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  requireDistinctApprover: z.boolean(),
  logoUrl: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  addresses: z.array(z.object({
    id: z.string().uuid().optional(),
    addressType: z.enum(["registered", "billing", "other"]),
    line1: z.string().trim().min(1).max(160),
    line2: z.string().trim().max(160).nullish(),
    city: z.string().trim().max(80).nullish(),
    region: z.string().trim().max(80).nullish(),
    postalCode: z.string().trim().max(24).nullish(),
    countryCode: country,
    isPrimary: z.boolean(),
  })).max(20),
  contacts: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(160),
    roleTitle: z.string().trim().max(80).nullish(),
    phone: z.string().trim().max(40).nullish(),
    email: z.string().email().nullish(),
    isPrimary: z.boolean(),
  })).max(30),
});

export const numberingBody = z.object({
  prefix: z.string().max(12),
  nextNumber: z.number().int().min(1),
  padLength: z.number().int().min(1).max(12),
});

export const accountingProfileBody = z.object({
  countryCode: country,
  name: z.string().trim().min(1).max(120),
  complianceStatus: z.enum(["unverified", "reviewed"]),
  notes: z.string().trim().max(2000).nullish(),
});

const amount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "Amount must be a decimal string");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const taxCodeBody = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  ratePercent: amount,
  salesAccountId: z.string().uuid().nullish(),
  purchaseAccountId: z.string().uuid().nullish(),
  effectiveFrom: isoDate,
});

export const taxCodeAccountsBody = z.object({
  salesAccountId: z.string().uuid().nullish(),
  purchaseAccountId: z.string().uuid().nullish(),
});

export const retireTaxBody = z.object({ effectiveTo: isoDate });
