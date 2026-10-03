import { Router } from "express";
import { createBranchController, listAccessibleBranchesController, listBranchesController, updateBranchController } from "../controllers/branches.controller";
import { requireAnyPermission, requirePermission } from "../middleware/authorize";

const branchChoicePermissions = [
  "branches.view",
  "invoices.create",
  "invoices.update",
  "receipts.create",
  "receipts.update",
  "customer_returns.create",
  "customer_returns.update",
  "bills.create",
  "bills.update",
  "supplier_payments.create",
  "supplier_payments.update",
  "supplier_returns.create",
  "supplier_returns.update",
  "journals.create",
  "journals.update",
];

export const branchesRouter = Router();
branchesRouter.get("/branches/accessible", requireAnyPermission(branchChoicePermissions), listAccessibleBranchesController);
branchesRouter.get("/branches", requirePermission("branches.view"), listBranchesController);
branchesRouter.post("/branches", requirePermission("branches.create"), createBranchController);
branchesRouter.put("/branches/:id", requirePermission("branches.update"), updateBranchController);
