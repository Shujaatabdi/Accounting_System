import { Router } from "express";
import {
  approveReturnController,
  createReturnController,
  getReturnController,
  listReturnsController,
  postReturnController,
  rejectReturnController,
  reverseReturnController,
  submitReturnController,
  updateReturnController,
  voidReturnController,
} from "../controllers/customer-returns.controller";
import { requirePermission } from "../middleware/authorize";

export const customerReturnsRouter = Router();
customerReturnsRouter.get("/customer-returns", requirePermission("customer_returns.view"), listReturnsController);
customerReturnsRouter.post("/customer-returns", requirePermission("customer_returns.create"), createReturnController);
customerReturnsRouter.get("/customer-returns/:id", requirePermission("customer_returns.view"), getReturnController);
customerReturnsRouter.put("/customer-returns/:id", requirePermission("customer_returns.update"), updateReturnController);
customerReturnsRouter.post("/customer-returns/:id/submit", requirePermission("customer_returns.submit"), submitReturnController);
customerReturnsRouter.post("/customer-returns/:id/reject", requirePermission("customer_returns.approve"), rejectReturnController);
customerReturnsRouter.post("/customer-returns/:id/approve", requirePermission("customer_returns.approve"), approveReturnController);
customerReturnsRouter.post("/customer-returns/:id/post", requirePermission("customer_returns.post"), postReturnController);
customerReturnsRouter.post("/customer-returns/:id/void", requirePermission("customer_returns.void"), voidReturnController);
customerReturnsRouter.post("/customer-returns/:id/reverse", requirePermission("customer_returns.reverse"), reverseReturnController);
