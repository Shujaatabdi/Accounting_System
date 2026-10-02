import { Router } from "express";
import {
  createRoleController,
  listPermissionsController,
  listRolesController,
  updateRoleController,
} from "../controllers/roles.controller";
import { requirePermission } from "../middleware/authorize";

export const rolesRouter = Router();
rolesRouter.get("/permissions", requirePermission("roles.view"), listPermissionsController);
rolesRouter.get("/roles", requirePermission("roles.view"), listRolesController);
rolesRouter.post("/roles", requirePermission("roles.create"), createRoleController);
rolesRouter.put("/roles/:id", requirePermission("roles.update"), updateRoleController);
