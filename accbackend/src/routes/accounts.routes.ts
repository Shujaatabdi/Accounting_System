import { Router } from "express";
import {
  createAccountController,
  deleteAccountController,
  listAccountsController,
  updateAccountController,
} from "../controllers/accounts.controller";
import { requirePermission } from "../middleware/authorize";

export const accountsRouter = Router();
accountsRouter.get("/accounts", requirePermission("accounts.view"), listAccountsController);
accountsRouter.post("/accounts", requirePermission("accounts.create"), createAccountController);
accountsRouter.put("/accounts/:id", requirePermission("accounts.update"), updateAccountController);
accountsRouter.delete("/accounts/:id", requirePermission("accounts.update"), deleteAccountController);
