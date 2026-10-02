import { Router } from "express";
import {
  allocateReceiptController,
  approveReceiptController,
  createReceiptController,
  getReceiptController,
  listReceiptsController,
  postReceiptController,
  rejectReceiptController,
  reverseReceiptController,
  submitReceiptController,
  unallocateReceiptController,
  updateReceiptController,
  voidReceiptController,
} from "../controllers/receipts.controller";
import { requirePermission } from "../middleware/authorize";

export const receiptsRouter = Router();
receiptsRouter.get("/receipts", requirePermission("receipts.view"), listReceiptsController);
receiptsRouter.post("/receipts", requirePermission("receipts.create"), createReceiptController);
receiptsRouter.get("/receipts/:id", requirePermission("receipts.view"), getReceiptController);
receiptsRouter.put("/receipts/:id", requirePermission("receipts.update"), updateReceiptController);
receiptsRouter.post("/receipts/:id/submit", requirePermission("receipts.submit"), submitReceiptController);
receiptsRouter.post("/receipts/:id/reject", requirePermission("receipts.approve"), rejectReceiptController);
receiptsRouter.post("/receipts/:id/approve", requirePermission("receipts.approve"), approveReceiptController);
receiptsRouter.post("/receipts/:id/post", requirePermission("receipts.post"), postReceiptController);
receiptsRouter.post("/receipts/:id/allocations", requirePermission("receipts.allocate"), allocateReceiptController);
receiptsRouter.post("/receipts/:id/allocations/:allocationId/unallocate", requirePermission("receipts.allocate"), unallocateReceiptController);
receiptsRouter.post("/receipts/:id/void", requirePermission("receipts.void"), voidReceiptController);
receiptsRouter.post("/receipts/:id/reverse", requirePermission("receipts.reverse"), reverseReceiptController);
