import { Router } from "express";
import {
  allocatePaymentController,
  approvePaymentController,
  createPaymentController,
  getPaymentController,
  listPaymentsController,
  postPaymentController,
  rejectPaymentController,
  reversePaymentController,
  submitPaymentController,
  unallocatePaymentController,
  updatePaymentController,
  voidPaymentController,
} from "../controllers/supplier-payments.controller";
import { requirePermission } from "../middleware/authorize";

export const supplierPaymentsRouter = Router();
supplierPaymentsRouter.get("/supplier-payments", requirePermission("supplier_payments.view"), listPaymentsController);
supplierPaymentsRouter.post("/supplier-payments", requirePermission("supplier_payments.create"), createPaymentController);
supplierPaymentsRouter.get("/supplier-payments/:id", requirePermission("supplier_payments.view"), getPaymentController);
supplierPaymentsRouter.put("/supplier-payments/:id", requirePermission("supplier_payments.update"), updatePaymentController);
supplierPaymentsRouter.post("/supplier-payments/:id/submit", requirePermission("supplier_payments.submit"), submitPaymentController);
supplierPaymentsRouter.post("/supplier-payments/:id/reject", requirePermission("supplier_payments.approve"), rejectPaymentController);
supplierPaymentsRouter.post("/supplier-payments/:id/approve", requirePermission("supplier_payments.approve"), approvePaymentController);
supplierPaymentsRouter.post("/supplier-payments/:id/post", requirePermission("supplier_payments.post"), postPaymentController);
supplierPaymentsRouter.post("/supplier-payments/:id/allocations", requirePermission("supplier_payments.allocate"), allocatePaymentController);
supplierPaymentsRouter.post("/supplier-payments/:id/allocations/:allocationId/unallocate", requirePermission("supplier_payments.allocate"), unallocatePaymentController);
supplierPaymentsRouter.post("/supplier-payments/:id/void", requirePermission("supplier_payments.void"), voidPaymentController);
supplierPaymentsRouter.post("/supplier-payments/:id/reverse", requirePermission("supplier_payments.reverse"), reversePaymentController);
