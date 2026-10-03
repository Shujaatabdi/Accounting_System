import { Router } from "express";
import {
  approveBillController,
  createBillController,
  getBillController,
  listBillsController,
  postBillController,
  rejectBillController,
  reverseBillController,
  submitBillController,
  updateBillController,
  voidBillController,
} from "../controllers/bills.controller";
import { requirePermission } from "../middleware/authorize";

export const billsRouter = Router();
billsRouter.get("/bills", requirePermission("bills.view"), listBillsController);
billsRouter.post("/bills", requirePermission("bills.create"), createBillController);
billsRouter.get("/bills/:id", requirePermission("bills.view"), getBillController);
billsRouter.put("/bills/:id", requirePermission("bills.update"), updateBillController);
billsRouter.post("/bills/:id/submit", requirePermission("bills.submit"), submitBillController);
billsRouter.post("/bills/:id/reject", requirePermission("bills.approve"), rejectBillController);
billsRouter.post("/bills/:id/approve", requirePermission("bills.approve"), approveBillController);
billsRouter.post("/bills/:id/post", requirePermission("bills.post"), postBillController);
billsRouter.post("/bills/:id/void", requirePermission("bills.void"), voidBillController);
billsRouter.post("/bills/:id/reverse", requirePermission("bills.reverse"), reverseBillController);
