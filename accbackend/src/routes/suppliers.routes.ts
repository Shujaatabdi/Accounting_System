import { Router } from "express";
import {
  createSupplierController,
  getSupplierController,
  listSuppliersController,
  saveSupplierOpeningDetailsController,
  supplierBalanceController,
  supplierHistoryController,
  supplierProductsController,
  updateSupplierController,
} from "../controllers/suppliers.controller";
import { requirePermission } from "../middleware/authorize";

export const suppliersRouter = Router();
suppliersRouter.get("/suppliers", requirePermission("suppliers.view"), listSuppliersController);
suppliersRouter.post("/suppliers", requirePermission("suppliers.create"), createSupplierController);
suppliersRouter.put("/suppliers/opening-details", requirePermission("suppliers.update"), saveSupplierOpeningDetailsController);
suppliersRouter.get("/suppliers/:id", requirePermission("suppliers.view"), getSupplierController);
suppliersRouter.put("/suppliers/:id", requirePermission("suppliers.update"), updateSupplierController);
suppliersRouter.get("/suppliers/:id/balance", requirePermission("suppliers.view"), supplierBalanceController);
suppliersRouter.get("/suppliers/:id/history", requirePermission("suppliers.view"), supplierHistoryController);
suppliersRouter.get("/suppliers/:id/products", requirePermission("suppliers.view"), supplierProductsController);
