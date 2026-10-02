import { Router } from "express";
import {
  createCustomerController,
  customerBalanceController,
  customerHistoryController,
  getCustomerController,
  listCustomersController,
  saveOpeningDetailsController,
  updateCustomerController,
} from "../controllers/customers.controller";
import { requirePermission } from "../middleware/authorize";

export const customersRouter = Router();
customersRouter.get("/customers", requirePermission("customers.view"), listCustomersController);
customersRouter.post("/customers", requirePermission("customers.create"), createCustomerController);
customersRouter.put("/customers/opening-details", requirePermission("customers.update"), saveOpeningDetailsController);
customersRouter.get("/customers/:id", requirePermission("customers.view"), getCustomerController);
customersRouter.put("/customers/:id", requirePermission("customers.update"), updateCustomerController);
customersRouter.get("/customers/:id/balance", requirePermission("customers.view"), customerBalanceController);
customersRouter.get("/customers/:id/history", requirePermission("customers.view"), customerHistoryController);
