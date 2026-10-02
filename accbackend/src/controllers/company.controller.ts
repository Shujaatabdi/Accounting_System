import { actorFrom } from "../middleware/authenticate";
import { getCompany, updateCompanyProfile } from "../modules/company/company.service";
import {
  accountingProfileBody,
  companyBody,
  numberingBody,
  retireTaxBody,
  taxCodeBody,
} from "../modules/company/company.schemas";
import { listSequences, updateSequence } from "../modules/company/numbering.service";
import { createTaxCode, getAccountingProfile, listTaxCodes, retireTaxCode, updateAccountingProfile } from "../modules/company/tax.service";
import { salesSettingsBody } from "../modules/company/sales.schemas";
import { getSalesSettings, updateSalesSettingsProfile } from "../modules/company/sales.service";
import { parseBody, wrap } from "../shared/http";

export const getCompanyController = wrap(async (_req, res) => {
  res.json(await getCompany());
});

export const updateCompanyController = wrap(async (req, res) => {
  res.json(await updateCompanyProfile(parseBody(companyBody, req.body), actorFrom(req)));
});

export const listNumberingController = wrap(async (_req, res) => {
  res.json({ data: await listSequences() });
});

export const updateNumberingController = wrap(async (req, res) => {
  res.json(await updateSequence(req.params.docType, parseBody(numberingBody, req.body), actorFrom(req)));
});

export const getAccountingProfileController = wrap(async (_req, res) => {
  res.json(await getAccountingProfile());
});

export const updateAccountingProfileController = wrap(async (req, res) => {
  res.json(await updateAccountingProfile(parseBody(accountingProfileBody, req.body), actorFrom(req)));
});

export const getSalesSettingsController = wrap(async (_req, res) => {
  res.json(await getSalesSettings());
});

export const updateSalesSettingsController = wrap(async (req, res) => {
  res.json(await updateSalesSettingsProfile(parseBody(salesSettingsBody, req.body), actorFrom(req)));
});

export const listTaxCodesController = wrap(async (_req, res) => {
  res.json({ data: await listTaxCodes() });
});

export const createTaxCodeController = wrap(async (req, res) => {
  res.status(201).json(await createTaxCode(parseBody(taxCodeBody, req.body), actorFrom(req)));
});

export const retireTaxCodeController = wrap(async (req, res) => {
  const body = parseBody(retireTaxBody, req.body);
  res.json(await retireTaxCode(req.params.id, body.effectiveTo, actorFrom(req)));
});
