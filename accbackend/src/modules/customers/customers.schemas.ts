import { z } from "zod";
import { pageQuery } from "../../shared/http/pagination";

const amount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const country = z.string().regex(/^[A-Za-z]{2}$/);

const address = z.object({
  addressType: z.enum(["billing", "shipping", "other"]),
  line1: z.string().trim().min(1).max(160),
  line2: z.string().trim().max(160).nullish(),
  city: z.string().trim().max(80).nullish(),
  region: z.string().trim().max(80).nullish(),
  postalCode: z.string().trim().max(20).nullish(),
  countryCode: country,
  isPrimary: z.boolean(),
});

const contact = z.object({
  name: z.string().trim().min(1).max(160),
  roleTitle: z.string().trim().max(80).nullish(),
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().email().or(z.literal("")).nullish(),
  isPrimary: z.boolean(),
});

export const customerBody = z.object({
  code: z.string().trim().min(1).max(32),
  legalName: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(160),
  contactName: z.string().trim().max(160).nullish(),
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().email().or(z.literal("")).nullish(),
  taxIdentifier: z.string().trim().max(60).nullish(),
  paymentTermsDays: z.number().int().min(0).max(3650),
  creditLimit: amount.nullish(),
  isActive: z.boolean(),
  notes: z.string().trim().max(2000).nullish(),
  addresses: z.array(address).max(10),
  contacts: z.array(contact).max(10),
});

export const customerListQuery = pageQuery.extend({
  search: z.string().optional(),
  active: z.enum(["true", "false"]).optional(),
});

export const openingDetailBody = z.object({
  journalLineId: z.string().uuid(),
  lines: z.array(z.object({
    customerId: z.string().uuid(),
    amount,
  })).min(1).max(200),
});

export const historyQuery = pageQuery.extend({
  from: z.string().optional(),
  to: z.string().optional(),
});
