import { Router } from "express";
import {
  approveSupplierReturnController,
  createSupplierReturnController,
  getSupplierReturnController,
  listSupplierReturnsController,
  postSupplierReturnController,
  rejectSupplierReturnController,
  reverseSupplierReturnController,
  submitSupplierReturnController,
  updateSupplierReturnController,
  voidSupplierReturnController,
} from "../controllers/supplier-returns.controller";
import { requirePermission } from "../middleware/authorize";

export const supplierReturnsRouter = Router();
supplierReturnsRouter.get("/supplier-returns", requirePermission("supplier_returns.view"), listSupplierReturnsController);
supplierReturnsRouter.post("/supplier-returns", requirePermission("supplier_returns.create"), createSupplierReturnController);
supplierReturnsRouter.get("/supplier-returns/:id", requirePermission("supplier_returns.view"), getSupplierReturnController);
supplierReturnsRouter.put("/supplier-returns/:id", requirePermission("supplier_returns.update"), updateSupplierReturnController);
supplierReturnsRouter.post("/supplier-returns/:id/submit", requirePermission("supplier_returns.submit"), submitSupplierReturnController);
supplierReturnsRouter.post("/supplier-returns/:id/reject", requirePermission("supplier_returns.approve"), rejectSupplierReturnController);
supplierReturnsRouter.post("/supplier-returns/:id/approve", requirePermission("supplier_returns.approve"), approveSupplierReturnController);
supplierReturnsRouter.post("/supplier-returns/:id/post", requirePermission("supplier_returns.post"), postSupplierReturnController);
supplierReturnsRouter.post("/supplier-returns/:id/void", requirePermission("supplier_returns.void"), voidSupplierReturnController);
supplierReturnsRouter.post("/supplier-returns/:id/reverse", requirePermission("supplier_returns.reverse"), reverseSupplierReturnController);
