import { Router } from "express";
import {
  createTaxCodeController,
  getAccountingProfileController,
  getCompanyController,
  listNumberingController,
  listTaxCodesController,
  retireTaxCodeController,
  updateAccountingProfileController,
  updateCompanyController,
  updateNumberingController,
} from "../controllers/company.controller";
import { requirePermission } from "../middleware/authorize";

export const companyRouter = Router();
companyRouter.get("/company", requirePermission("company.view"), getCompanyController);
companyRouter.put("/company", requirePermission("company.update"), updateCompanyController);
companyRouter.get("/numbering", requirePermission("numbering.view"), listNumberingController);
companyRouter.put("/numbering/:docType", requirePermission("numbering.update"), updateNumberingController);
companyRouter.get("/accounting-profile", requirePermission("accounting_profile.view"), getAccountingProfileController);
companyRouter.put("/accounting-profile", requirePermission("accounting_profile.update"), updateAccountingProfileController);
companyRouter.get("/tax-codes", requirePermission("tax_codes.view"), listTaxCodesController);
companyRouter.post("/tax-codes", requirePermission("tax_codes.manage"), createTaxCodeController);
companyRouter.post("/tax-codes/:id/retire", requirePermission("tax_codes.manage"), retireTaxCodeController);
