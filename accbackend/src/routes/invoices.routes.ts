import { Router } from "express";
import {
  approveInvoiceController,
  createInvoiceController,
  getInvoiceController,
  listInvoicesController,
  postInvoiceController,
  rejectInvoiceController,
  reverseInvoiceController,
  submitInvoiceController,
  updateInvoiceController,
  voidInvoiceController,
} from "../controllers/invoices.controller";
import { requirePermission } from "../middleware/authorize";

export const invoicesRouter = Router();
invoicesRouter.get("/invoices", requirePermission("invoices.view"), listInvoicesController);
invoicesRouter.post("/invoices", requirePermission("invoices.create"), createInvoiceController);
invoicesRouter.get("/invoices/:id", requirePermission("invoices.view"), getInvoiceController);
invoicesRouter.put("/invoices/:id", requirePermission("invoices.update"), updateInvoiceController);
invoicesRouter.post("/invoices/:id/submit", requirePermission("invoices.submit"), submitInvoiceController);
invoicesRouter.post("/invoices/:id/reject", requirePermission("invoices.approve"), rejectInvoiceController);
invoicesRouter.post("/invoices/:id/approve", requirePermission("invoices.approve"), approveInvoiceController);
invoicesRouter.post("/invoices/:id/post", requirePermission("invoices.post"), postInvoiceController);
invoicesRouter.post("/invoices/:id/void", requirePermission("invoices.void"), voidInvoiceController);
invoicesRouter.post("/invoices/:id/reverse", requirePermission("invoices.reverse"), reverseInvoiceController);
