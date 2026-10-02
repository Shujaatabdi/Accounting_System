import { Router } from "express";
import { createBranchController, listBranchesController, updateBranchController } from "../controllers/branches.controller";
import { requirePermission } from "../middleware/authorize";

export const branchesRouter = Router();
branchesRouter.get("/branches", requirePermission("branches.view"), listBranchesController);
branchesRouter.post("/branches", requirePermission("branches.create"), createBranchController);
branchesRouter.put("/branches/:id", requirePermission("branches.update"), updateBranchController);
