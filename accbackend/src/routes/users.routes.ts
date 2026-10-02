import { Router } from "express";
import { createUserController, listAuditController, listUsersController, updateUserController } from "../controllers/users.controller";
import { requirePermission } from "../middleware/authorize";

export const usersRouter = Router();
usersRouter.get("/users", requirePermission("users.view"), listUsersController);
usersRouter.post("/users", requirePermission("users.create"), createUserController);
usersRouter.put("/users/:id", requirePermission("users.update"), updateUserController);
usersRouter.get("/audit", requirePermission("audit.view"), listAuditController);
